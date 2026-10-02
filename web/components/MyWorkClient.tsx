'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import CoverageSnapshot from './CoverageSnapshot';

type WorkFilter = 'all' | 'question_sets' | 'papers';
type RecentView = 'latest' | 'in_progress';

type RecoverySession = {
  id:string;
  topic:string;
  mode:'practice'|'exam';
  status:'in-progress'|'marking';
  questionIds:string[];
  currentQuestion:number;
  updatedAt:string;
};

type WorkQuestion = {
  question_id: string;
  position: number;
  marks_awarded: number | null;
  marks_available: number | null;
  marked_at: string | null;
};

type WorkItem = {
  id: string;
  title: string;
  kind: string;
  status: 'in_progress' | 'completed' | 'marking' | 'marked';
  created_at: string;
  completed_at: string | null;
  marked_at: string | null;
  settings?: Record<string, any> | null;
  work_questions?: WorkQuestion[];
};

function isPaper(item: WorkItem) {
  return (
    item.kind === 'exam' ||
    item.kind === 'paper' ||
    item.kind === 'past_paper' ||
    item.kind === 'generated_paper'
  );
}

function workTypeLabel(item: WorkItem) {
  return isPaper(item) ? 'Paper' : 'Question Set';
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(value);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

function scoreFor(item: WorkItem) {
  const questions = item.work_questions ?? [];

  const awarded = questions.reduce(
    (total, question) => total + (question.marks_awarded ?? 0),
    0
  );

  const available = questions.reduce(
    (total, question) => total + (question.marks_available ?? 0),
    0
  );

  const hasResult =
    item.status === 'marked' &&
    questions.some(question => question.marks_available !== null);

  return {
    awarded,
    available,
    hasResult,
  };
}

function progressFor(item: WorkItem) {
  const total = item.work_questions?.length ?? 0;

  const currentQuestion = Number(
    item.settings?.currentQuestion ?? 0
  );

  if (!total) {
    return {
      current: 0,
      total: 0,
      percent: 0,
    };
  }

  const current = Math.min(
    Math.max(currentQuestion + 1, 1),
    total
  );

  return {
    current,
    total,
    percent: Math.round((current / total) * 100),
  };
}

type Props = {
  home?: boolean;
};

export default function MyWorkPage({ home = false }: Props) {
  const [work, setWork] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);

  const [recovery,setRecovery] =
    useState<RecoverySession|null>(null);

  const [filter, setFilter] =
    useState<WorkFilter>('all');

  const [showMore, setShowMore] =
    useState(false);

  const [recentView, setRecentView] =
    useState<RecentView>('latest');

  useEffect(() => {
    
    try{
      const key =
        localStorage.getItem('dojo-continue');

      if(key){
        const raw=localStorage.getItem(key);

        if(raw){
          const value=JSON.parse(raw);

          if(
            Array.isArray(value?.questionIds) &&
            value.questionIds.length &&
            (
              value.status==='in-progress' ||
              value.status==='marking'
            )
          ){
            setRecovery(value);
          }else{
            localStorage.removeItem('dojo-continue');
          }
        }else{
          localStorage.removeItem('dojo-continue');
        }
      }
    }catch(err){
      console.warn(
        'Could not restore Continue',
        err
      );
      localStorage.removeItem('dojo-continue');
    }
async function loadWork() {
      const { data: auth } =
        await supabase.auth.getUser();

      if (!auth.user) {
        setLoggedIn(false);
        setWork([]);
        setLoading(false);
        return;
      }

      setLoggedIn(true);

      let [
        flagsResult,
        workResult
      ] = await Promise.all([
        supabase
          .from('question_flags')
          .select('question_id', {
            count:'exact',
            head:true
          })
          .eq('user_id',auth.user.id),

        supabase
          .from('work_items')
          .select(`
            id,
            title,
            kind,
            status,
            created_at,
            completed_at,
            marked_at,
            settings,
            work_questions (
              question_id,
              position,
              marks_awarded,
              marks_available,
              marked_at
            )
          `)
          .is('archived_at', null)
          .order('created_at',{
            ascending:false
          })
          .limit(50)
      ]);

      /*
       * A hard refresh can occasionally coincide with
       * Supabase restoring its persisted auth session.
       * Retry My Work once before treating it as failed.
       */
      if(workResult.error){
        await new Promise(resolve =>
          window.setTimeout(resolve,250)
        );

        const { data: retryAuth } =
          await supabase.auth.getUser();

        if(retryAuth.user){
          workResult = await supabase
            .from('work_items')
            .select(`
              id,
              title,
              kind,
              status,
              created_at,
              completed_at,
              marked_at,
              settings,
              work_questions (
                question_id,
                position,
                marks_awarded,
                marks_available,
                marked_at
              )
            `)
            .is('archived_at', null)
            .order('created_at',{
              ascending:false
            })
            .limit(50);
        }
      }

      if(flagsResult.error){
        console.warn(
          'Could not load flagged question count',
          flagsResult.error
        );
      }else{
        setFlaggedCount(
          flagsResult.count ?? 0
        );
      }

      if(workResult.error){
        console.warn(
          'Could not load My Work after retry:',
          workResult.error
        );

        setWork([]);
      }else{
        setWork(
          (workResult.data ?? []) as WorkItem[]
        );
      }
      setLoading(false);
    }

    loadWork();
  }, []);
  /*
   * Continue is one recovery slot, not an unfinished-work queue.
   *
   * `work` is loaded newest-first. Only the newest saved item can
   * occupy Continue. If that item has been properly ended, Continue
   * is empty rather than falling back to an older abandoned item.
   */

  async function archiveWorkItem(id: string) {
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) return;

    const archivedAt = new Date().toISOString();

    const { error } = await supabase
      .from('work_items')
      .update({ archived_at: archivedAt })
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (error) {
      console.error('Could not remove work from view:', error);
      return;
    }

    setWork(current =>
      current.filter(item => item.id !== id)
    );
  }

  const filteredRecent = useMemo(() => {
    return work.filter(item => {
      if (item.settings?.draft === true) {
        return false;
      }

      const isInProgress =
        item.status === 'in_progress' ||
        item.status === 'marking';

      const isLatest =
        item.status === 'completed' ||
        item.status === 'marked';

      if (recentView === 'in_progress') {
        if (!isInProgress) return false;
      } else {
        if (!isLatest) return false;
      }

      if (filter === 'papers') {
        return isPaper(item);
      }

      if (filter === 'question_sets') {
        return !isPaper(item);
      }

      return true;
    });
  }, [work, filter, recentView]);

  const visibleRecent = showMore
    ? filteredRecent
    : filteredRecent.slice(0, 3);

  return (
    <main className={`work-page${home ? ' dojoHome' : ''}`}>
      <div className="homeHeader">
        {home ? (
          <>
            <div className="dojoDefinition">
              <div className="dojoDefinitionHeading">
                <h1>DOJO</h1>
                <span className="dojoPronunciation">/ˈdəʊ.dʒəʊ/</span>
                <span className="dojoWordClass">noun</span>
              </div>

              <p>
                A place devoted to disciplined practice, learning and improvement.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="page-kicker">
              My Work
            </div>
            <h1>Your work</h1>
            <p>
              Pick up where you left off or review what you've done.
            </p>
          </>
        )}
      </div>

      <section className="homeStartGrid">
        <Link
          href="/topics"
          className="homeStartCard"
        >
          <div>
            <span className="dashboardLabel">
              Explore
            </span>

            <h2>Topics</h2>

            <p>
              Choose an area of A-level maths and practise it directly.
            </p>
          </div>

        </Link>

        <Link
          href="/question-sets"
          className="homeStartCard"
        >
          <div>
            <span className="dashboardLabel">
              Practice
            </span>

            <h2>Question Sets</h2>

            <p>
              Build a mixed set around the topics you want to work on.
            </p>
          </div>

        </Link>

        <Link
          href="/papers"
          className="homeStartCard"
        >
          <div>
            <span className="dashboardLabel">
              Assessment
            </span>

            <h2>Papers</h2>

            <p>
              Work through past papers or DOJO-generated papers.
            </p>
          </div>

        </Link>

        <Link
          href="/review"
          className="homeStartCard"
        >
          <div>
            <span className="dashboardLabel">
              Review
            </span>

            <h2>Review</h2>

            <p>
              Review past results and revisit questions.
              {!loading && flaggedCount > 0
                ? ` ${flaggedCount} flagged.`
                : ''}
            </p>
          </div>

        </Link>
      </section>
      

      {!loading && recovery && (
        <section className="myWorkPanel continuePanel">
          <div className="dashboardPanelHeading">
            <div>
              <span className="dashboardLabel">
                Continue
              </span>

              <h2>
                {recovery.topic || 'Question Set'}
              </h2>

              <p>
                {recovery.mode==='exam'
                  ? 'Paper'
                  : 'Question Set'}

                {` · ${Math.min(
                  recovery.currentQuestion + 1,
                  recovery.questionIds.length
                )}/${recovery.questionIds.length} questions`}
              </p>
            </div>

            <Link
              className="dashboardPrimaryAction"
              href={
                `/practice?topic=${encodeURIComponent(
                  recovery.topic || 'Question Set'
                )}` +
                `&mode=${encodeURIComponent(
                  recovery.mode
                )}` +
                `&ids=${encodeURIComponent(
                  recovery.questionIds.join(',')
                )}` +
                `&resumeQuestion=${recovery.currentQuestion}` +
                `&resumeStage=${
                  recovery.status==='marking'
                    ? 'marking'
                    : 'doing'
                }`
              }
            >
              {recovery.status==='marking'
                ? 'Continue marking →'
                : 'Resume →'}
            </Link>
          </div>

          {recovery.status==='in-progress' && (
            <div className="continueProgress">
              <div
                style={{
                  width:`${Math.round(
                    (
                      Math.min(
                        recovery.currentQuestion + 1,
                        recovery.questionIds.length
                      ) /
                      recovery.questionIds.length
                    ) * 100
                  )}%`
                }}
              />
            </div>
          )}
        </section>
      )}
      {!loading && (
        <div className="myWorkDashboardGrid">
          <section className="myWorkPanel dashboardRecent">
            <div className="dashboardPanelHeading compact">
              <div>
                <span className="dashboardLabel">
                  Recent work
                </span>

                <div style={{display:'flex',alignItems:'center',gap:'14px'}}>
                  <button
                    type="button"
                    onClick={() => {
                      setRecentView('latest');
                      setShowMore(false);
                    }}
                    style={{
                      border:0,
                      borderBottom:recentView === 'latest'
                        ? '2px solid currentColor'
                        : '2px solid transparent',
                      background:'transparent',
                      padding:'0 0 4px',
                      font:'inherit',
                      fontSize:'20px',
                      fontWeight:700,
                      color:recentView === 'latest'
                        ? 'inherit'
                        : '#777',
                      cursor:'pointer'
                    }}
                  >
                    Latest
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRecentView('in_progress');
                      setShowMore(false);
                    }}
                    style={{
                      border:0,
                      borderBottom:recentView === 'in_progress'
                        ? '2px solid currentColor'
                        : '2px solid transparent',
                      background:'transparent',
                      padding:'0 0 4px',
                      font:'inherit',
                      fontSize:'14px',
                      fontWeight:700,
                      color:recentView === 'in_progress'
                        ? 'inherit'
                        : '#777',
                      cursor:'pointer'
                    }}
                  >
                    In progress
                  </button>
                </div>
              </div>
            </div>

            <div className="dashboardFilters">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => {
                  setFilter('all');
                  setShowMore(false);
                }}
              >
                All
              </button>

              <button
                className={
                  filter === 'question_sets'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setFilter('question_sets');
                  setShowMore(false);
                }}
              >
                Question Sets
              </button>

              <button
                className={
                  filter === 'papers'
                    ? 'active'
                    : ''
                }
                onClick={() => {
                  setFilter('papers');
                  setShowMore(false);
                }}
              >
                Papers
              </button>
            </div>

            <div className="dashboardRecentList">
              {loggedIn === false ? (
                <div className="accountFeaturePreview">
                  <div className="previewRows" aria-hidden="true">
                    <div className="previewWorkRow">
                      <div>
                        <strong>Integration practice</strong>
                        <span>Question Set · Today</span>
                      </div>

                      <span className="previewScore">8/10</span>
                    </div>

                    <div className="previewWorkRow faded">
                      <div>
                        <strong>Generated Paper</strong>
                        <span>Paper · Yesterday</span>
                      </div>

                      <span className="previewScore">62/75</span>
                    </div>
                  </div>

                  <div className="previewMessage">
                    <strong>Your work, saved in one place</strong>

                    <p>
                      Create a free account to save your work,
                      pick up where you left off and review your results.
                    </p>

                    <Link href="/signup?next=%2F">
                      Create free account →
                    </Link>

                    <span>
                      Already have an account?{' '}
                      <Link href="/login?next=%2F">Log in</Link>
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {visibleRecent.length === 0 && (
                    <p className="empty-history">
                      No work here yet.
                    </p>
                  )}

                  {visibleRecent.map(item => {
                    const {
                      awarded,
                      available,
                      hasResult,
                    } = scoreFor(item);

                    return (
                      <div className="dashboardRecentItem" key={item.id}>
                      <Link
                        href={`/practice?work=${encodeURIComponent(
                          item.id
                        )}`}
                        className="dashboardRecentRow"
                      >
                        <div>
                          <strong>{item.title}</strong>{' '}

                          <span>
                            {workTypeLabel(item)}
                            {' · '}
                            {dateLabel(
                              item.marked_at ??
                                item.completed_at ??
                                item.created_at
                            )}
                          </span>
                        </div>

                        <div className="dashboardRecentResult">
                          {hasResult ? (
                            <span className="scoreBadge">
                              <strong>{awarded}</strong>
                              <small>/{available}</small>
                            </span>
                          ) : (
                            <span
                              className={`statusBadge status-${item.status}`}
                            >
                              {item.status === 'in_progress'
                                ? 'In progress'
                                : item.status === 'marking'
                                ? 'Marking'
                                : item.status === 'completed'
                                ? 'Ready to mark'
                                : 'Completed'}
                            </span>
                          )}

                          <span className="recentArrow">→</span>
                        </div>
                      </Link>
                        <details className="workItemMenu">
                          <summary
                            aria-label="Work item options"
                            title="Options"
                          >
                            ⋯
                          </summary>
                          <div className="workItemMenuPopup">
                            <button
                              type="button"
                              onClick={() => archiveWorkItem(item.id)}
                            >
                              Remove from view
                            </button>
                          </div>
                        </details>
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            {loggedIn !== false && filteredRecent.length > 3 && (
              <button
                className="dashboardShowMore"
                onClick={() =>
                  setShowMore(value => !value)
                }
              >
                {showMore
                  ? 'Show less ↑'
                  : 'Show more ↓'}
              </button>
            )}
          </section>

          <section className="myWorkPanel coveragePanel">
            <div className="dashboardPanelHeading compact">
              <div>
                <span className="dashboardLabel">
                  Coverage
                </span>

                <h2>Your coverage</h2>
              </div>

              <Link href="/coverage">
                View coverage →
              </Link>
            </div>

            <div className="coverageDashboardBody">
              {loggedIn === false ? (
                <div className="coveragePreview">
                  <div
                    className="previewCoverageHeader"
                    aria-hidden="true"
                  >
                    <div>
                      <span className="dashboardLabel">
                        Architecture coverage
                      </span>

                      <strong>
                        Track what you've encountered
                      </strong>
                    </div>

                    <span>— / —</span>
                  </div>

                  <div
                    className="previewCoverageTrack"
                    aria-hidden="true"
                  >
                    <div />
                  </div>

                  <div
                    className="previewCoverageRows"
                    aria-hidden="true"
                  >
                    <div>
                      <span>Trigonometry</span>
                      <div>
                        <i style={{width:'68%'}} />
                      </div>
                    </div>

                    <div>
                      <span>Integration</span>
                      <div>
                        <i style={{width:'42%'}} />
                      </div>
                    </div>

                    <div>
                      <span>Vectors</span>
                      <div>
                        <i style={{width:'24%'}} />
                      </div>
                    </div>
                  </div>

                  <div className="previewMessage coveragePreviewMessage">
                    <strong>
                      See where your practice is taking you
                    </strong>

                    <p>
                      DOJO tracks the question types you've encountered
                      and shows the gaps in your coverage as you work.
                    </p>

                    <Link href="/signup?next=%2Fcoverage">
                      Create free account →
                    </Link>
                  </div>
                </div>
              ) : (
                <CoverageSnapshot />
              )}
            </div>
          </section>
        </div>
      )}

      <style jsx>{`
        .homeHeader {
          margin-bottom: 28px;
        }

        .homeHeader h1 {
          margin: 8px 0 6px;
          font-size: 36px;
          line-height: 1.1;
        }

        .homeHeader p {
          margin: 0;
          color: #6d6d6d;
          font-size: 15px;
        }

        .homeStartGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
          margin-bottom: 18px;
        }

        .homeStartCard {
          position: relative;
          min-height: 155px;
          display: grid;
          grid-template-columns: 42px minmax(0, 1fr) auto;
          align-items: start;
          gap: 15px;

          border: 1px solid #dedede;
          border-radius: 12px;
          background: #fff;

          padding: 21px;

          color: #111;
          text-decoration: none;

          transition:
            border-color 120ms ease,
            transform 120ms ease,
            box-shadow 120ms ease;
        }

        .homeStartCard:hover {
          border-color: #aaa;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.045);
        }

        .homeStartIcon {
          width: 40px;
          height: 40px;

          display: flex;
          align-items: center;
          justify-content: center;

          border-radius: 9px;
          background: #f2f2f2;

          font-size: 16px;
          font-weight: 700;
        }

        .homeStartCard.featured .homeStartIcon {
          background: #111;
          color: #fff;
        }

        .homeStartCard h2 {
          margin: 5px 0 7px;
          font-size: 19px;
        }

        .homeStartCard p {
          max-width: 290px;
          margin: 0;

          color: #707070;
          font-size: 13px;
          line-height: 1.45;
        }

        .homeStartArrow {
          color: #777;
          font-size: 18px;
        }

        .homeStartCard:hover .homeStartArrow {
          color: #111;
        }

        .myWorkPanel {
          border: 1px solid #dedede;
          border-radius: 10px;
          background: #fff;
          padding: 22px;
        }

        .continuePanel {
          margin-top: 28px;
          padding: 20px 22px;
        }

        .dashboardPanelHeading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .dashboardPanelHeading.compact {
          align-items: flex-start;
        }

        .dashboardPanelHeading h2 {
          margin: 4px 0 3px;
          font-size: 20px;
          line-height: 1.2;
        }

        .dashboardPanelHeading p {
          margin: 0;
          color: #777;
          font-size: 13px;
        }

        .dashboardLabel {
          display: block;
          color: #777;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .dashboardPrimaryAction {
          flex: 0 0 auto;
          color: #111;
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
        }

        .continueProgress {
          height: 4px;
          margin-top: 17px;
          border-radius: 999px;
          background: #ececec;
          overflow: hidden;
        }

        .continueProgress > div {
          height: 100%;
          background: #111;
        }

        .myWorkDashboardGrid {
          display: grid;
          grid-template-columns:
            minmax(0, 1.2fr)
            minmax(320px, 0.8fr);
          gap: 18px;
          margin-top: 18px;
          align-items: start;
        }

        .dashboardRecent {
          min-height: 410px;
        }

        .dashboardFilters {
          display: flex;
          gap: 6px;
          margin: 18px 0 14px;
        }

        .dashboardFilters button {
          border: 1px solid #ddd;
          border-radius: 999px;
          background: #fff;
          padding: 6px 11px;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
        }

        .dashboardFilters button.active {
          border-color: #111;
          background: #111;
          color: #fff;
        }

        .dashboardRecentList {
          border-top: 1px solid #e5e5e5;
        }

        .dashboardRecentRow {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 20px;
          min-height: 62px;
          padding: 12px 4px;
          border-bottom: 1px solid #e5e5e5;
          color: inherit;
          text-decoration: none;
        }

        .dashboardRecentRow:hover {
          background: #fafafa;
        }

        .dashboardRecentRow > div:first-child {
          min-width: 0;
        }

        .dashboardRecentRow strong {
          display: block;
          overflow: hidden;
          font-size: 13px;
          line-height: 1.3;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .dashboardRecentRow span {
          display: block;
          margin-top: 4px;
          color: #777;
          font-size: 11px;
        }

        .dashboardRecentResult {
          display: flex;
          align-items: center;
          gap: 14px;
          flex: 0 0 auto;
          text-align: right;
        }

        .dashboardRecentResult strong {
          white-space: nowrap;
          font-size: 13px;
        }

        .dashboardRecentResult span {
          margin: 0;
          color: #111;
          font-size: 15px;
        }

        .dashboardShowMore {
          display: block;
          margin: 16px auto 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          font: inherit;
          color: #555;
          font-size: 11px;
          font-weight: 700;
        }

        .dashboardShowMore:hover {
          color: #111;
        }

        .coveragePanel {
          min-height: 410px;
        }

        .coveragePanel a {
          color: #111;
          text-decoration: none;
          white-space: nowrap;
          font-size: 12px;
          font-weight: 700;
        }

        .coverageDashboardBody {
          margin-top: 18px;
        }

        .coverageDashboardBody :global(.coverage-snapshot) {
          border: 0;
          border-radius: 0;
          padding: 0;
          background: transparent;
        }

        .myWorkActionGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          margin-top: 18px;
        }

        .myWorkActionCard {
          min-height: 145px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1px solid #dedede;
          border-radius: 10px;
          background: #fff;
          padding: 22px;
          color: inherit;
          text-decoration: none;
          transition:
            border-color 120ms ease,
            transform 120ms ease;
        }

        .myWorkActionCard:hover {
          border-color: #aaa;
          transform: translateY(-1px);
        }

        .myWorkActionCard h2 {
          margin: 5px 0 7px;
          font-size: 20px;
        }

        .myWorkActionCard p {
          max-width: 440px;
          margin: 0;
          color: #707070;
          font-size: 13px;
          line-height: 1.45;
        }

        .myWorkActionCard > strong {
          margin-top: 20px;
          font-size: 12px;
        }

        @media (max-width: 850px) {
          .homeStartGrid {
            grid-template-columns: 1fr;
          }

          .homeStartCard {
            min-height: 0;
          }

          .myWorkDashboardGrid,
          .myWorkActionGrid {
            grid-template-columns: 1fr;
          }

          .dashboardRecent,
          .coveragePanel {
            min-height: 0;
          }
        }

        @media (max-width: 600px) {
          .myWorkPanel,
          .myWorkActionCard {
            padding: 17px;
          }

          .continuePanel .dashboardPanelHeading {
            flex-direction: column;
            align-items: flex-start;
          }

          .dashboardRecentRow {
            gap: 12px;
          }
        }

        /* Home checkpoint visual cleanup */
        .homeHeader {
          margin-bottom: 24px;
        }

        .homeHeader p {
          margin: 0;
          color: #6f7671;
          font-size: 15px;
          line-height: 1.5;
        }

        .homeStartGrid {
          gap: 12px;
          margin-bottom: 18px;
        }

        .homeStartCard {
          min-height: 150px;
          display: flex;
          flex-direction: column;
          gap: 0;
          padding: 22px;
          border: 1px solid rgba(22, 33, 26, 0.11);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.78);
          transition:
            border-color 140ms ease,
            background 140ms ease,
            transform 140ms ease,
            box-shadow 140ms ease;
        }

        .homeStartCard:hover {
          border-color: #496251;
          background: #f7faf8;
          transform: translateY(-2px);
          box-shadow: 0 10px 28px rgba(23, 35, 27, 0.055);
        }

        .homeStartCard h2 {
          margin: 8px 0 7px;
          font-size: 20px;
          letter-spacing: -0.02em;
        }

        .homeStartCard p {
          margin: 0 0 22px;
          color: #707772;
          line-height: 1.5;
        }

        .homeStartArrow {
          margin-top: auto;
          color: #627068;
          transition: transform 140ms ease;
        }

        .homeStartCard:hover .homeStartArrow {
          transform: translateX(3px);
        }

        .myWorkPanel {
          border: 1px solid rgba(22, 33, 26, 0.1);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.78);
        }

        .continuePanel {
          margin-top: 18px;
          padding: 21px 22px 18px;
        }

        .dashboardPrimaryAction {
          padding: 9px 12px;
          border: 1px solid rgba(22, 33, 26, 0.12);
          border-radius: 9px;
          background: #fff;
        }

        .dashboardPrimaryAction:hover {
          border-color: #496251;
          background: #f2f6f3;
        }

        .continueProgress {
          height: 5px;
          background: #e8ece9;
        }

        .continueProgress > div {
          border-radius: inherit;
          background: #365441;
        }

        .myWorkDashboardGrid {
          gap: 16px;
          margin-top: 16px;
        }

        .dashboardRecentList {
          display: grid;
          gap: 8px;
          border-top: 0;
        }

        .dashboardRecentRow {
          min-height: 68px;
          padding: 13px 14px;
          border: 1px solid rgba(22, 33, 26, 0.09);
          border-radius: 11px;
          background: #fff;
        }

        .dashboardRecentRow:hover {
          border-color: rgba(57, 84, 67, 0.35);
          background: #fafcfb;
        }

        .dashboardRecentRow > div:first-child span {
          margin-top: 5px;
          color: #858b87;
        }

        .dashboardRecentResult {
          gap: 11px;
        }

        .scoreBadge {
          min-width: 57px;
          display: inline-flex !important;
          align-items: baseline;
          justify-content: center;
          padding: 8px 9px;
          border: 1px solid #9fbea8;
          border-radius: 9px;
          background: #d8e5dc;
          color: #203b29 !important;
          margin: 0 !important;
        }

        .scoreBadge strong {
          display: inline;
          overflow: visible;
          color: #203b29;
          font-size: 14px;
          line-height: 1;
        }

        .scoreBadge small {
          color: #486e55;
          font-size: 10px;
          font-weight: 700;
        }

        .statusBadge {
          display: inline-flex !important;
          align-items: center;
          min-height: 28px;
          padding: 0 9px;
          margin: 0 !important;
          border: 1px solid #d9dedb;
          border-radius: 8px;
          background: #f6f7f6;
          color: #667069 !important;
          white-space: nowrap;
          font-size: 10px !important;
          font-weight: 700;
        }

        .status-marking,
        .status-completed {
          border-color: #d8bd72;
          background: #f3e5b8;
          color: #594613 !important;
        }

        .recentArrow {
          margin: 0 !important;
          color: #66736b !important;
          font-size: 15px !important;
        }

        .coverageDashboardBody {
          padding-top: 16px;
          border-top: 1px solid rgba(22, 33, 26, 0.08);
        }


        /* Logged-out DOJO previews */

        .previewRows {
          display: grid;
          gap: 8px;
          opacity: 0.46;
          pointer-events: none;
          user-select: none;
        }

        .previewWorkRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          min-height: 66px;
          padding: 12px 14px;
          border: 1px solid rgba(22, 33, 26, 0.09);
          border-radius: 11px;
          background: #fff;
        }

        .previewWorkRow.faded {
          opacity: 0.68;
        }

        .previewWorkRow strong {
          display: block;
          font-size: 13px;
        }

        .previewWorkRow span {
          display: block;
          margin-top: 5px;
          color: #858b87;
          font-size: 11px;
        }

        .previewWorkRow .previewScore {
          margin: 0;
          padding: 7px 9px;
          border: 1px solid #cbd6ce;
          border-radius: 9px;
          background: #f1f5f2;
          color: #294534;
          font-size: 12px;
          font-weight: 800;
        }

        .previewMessage {
          margin-top: 18px;
          padding-top: 17px;
          border-top: 1px solid rgba(22, 33, 26, 0.09);
        }

        .previewMessage > strong {
          display: block;
          margin-bottom: 6px;
          font-size: 14px;
        }

        .previewMessage p {
          max-width: 500px;
          margin: 0 0 12px;
          color: #707772;
          font-size: 12px;
          line-height: 1.5;
        }

        .previewMessage > a {
          display: inline-block;
          padding: 8px 11px;
          border: 1px solid rgba(22, 33, 26, 0.14);
          border-radius: 9px;
          background: #fff;
          color: #263b2e;
          text-decoration: none;
          font-size: 12px;
          font-weight: 800;
        }

        .previewMessage > a:hover {
          border-color: #496251;
          background: #f2f6f3;
        }

        .previewMessage > span {
          display: block;
          margin-top: 10px;
          color: #858b87;
          font-size: 11px;
        }

        .previewMessage > span a {
          color: #445a4b;
          font-weight: 700;
        }

        .previewCoverageHeader {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          opacity: 0.48;
        }

        .previewCoverageHeader strong {
          display: block;
          margin-top: 6px;
          font-size: 18px;
        }

        .previewCoverageHeader > span {
          font-size: 14px;
          font-weight: 800;
        }

        .previewCoverageTrack {
          height: 6px;
          margin-top: 15px;
          overflow: hidden;
          border-radius: 999px;
          background: #e8ece9;
          opacity: 0.55;
        }

        .previewCoverageTrack > div {
          width: 38%;
          height: 100%;
          border-radius: inherit;
          background: #73877a;
        }

        .previewCoverageRows {
          display: grid;
          gap: 11px;
          margin-top: 18px;
          opacity: 0.42;
          pointer-events: none;
          user-select: none;
        }

        .previewCoverageRows > div > span {
          display: block;
          margin-bottom: 5px;
          font-size: 11px;
          font-weight: 700;
        }

        .previewCoverageRows > div > div {
          height: 4px;
          overflow: hidden;
          border-radius: 999px;
          background: #e5e9e6;
        }

        .previewCoverageRows i {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: #667a6d;
        }

        .coveragePreviewMessage {
          margin-top: 20px;
        }



        /* DOJO HOME — DARK DIRECTION */

        :global(body:has(.dojoHome)) {
          background: #151816;
          color: #ecece5;
        }

        :global(body:has(.dojoHome) .nav) {
          background: #151816;
          border-bottom-color: #2b302c;
        }

        :global(body:has(.dojoHome) .nav a) {
          color: #a8ada7;
        }

        :global(body:has(.dojoHome) .nav a:hover),
        :global(body:has(.dojoHome) .nav .brand) {
          color: #f1f1ea;
        }

        .dojoHome {
          --dojo-ink: #efefe8;
          --dojo-muted: #969c96;
          --dojo-green: #5f806a;
          --dojo-green-dark: #789680;
          --dojo-line: #343934;
          --dojo-paper: #151816;
          --dojo-surface: #1b1f1c;

          color: var(--dojo-ink);
        }

        .dojoHome .page-kicker,
        .dojoHome .dashboardLabel {
          color: #7f8e83;
        }

        .dojoHome .dojoHomeMark span {
          background: #688773;
        }

        .dojoHome .homeHeader p {
          color: #9da39d;
        }

        .dojoHome .homeStartGrid {
          border-color: #373c38;
        }

        .dojoHome .homeStartCard {
          border-color: #373c38;
          background: transparent;
          color: #efefe8;
        }

        .dojoHome .homeStartCard:hover {
          border-color: #373c38;
          background: #202b23;
          color: #f4f4ed;
        }

        .dojoHome .homeStartCard p {
          color: #969c96;
        }

        .dojoHome .homeStartArrow {
          color: #789680;
        }

        .dojoHome .homeStartCard:hover p,
        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: #abb7ae;
        }

        .dojoHome .myWorkPanel {
          border-color: #343934;
          background: #1a1e1b;
        }

        .dojoHome .continuePanel {
          border-left-color: #688773;
        }

        .dojoHome .dashboardPanelHeading h2,
        .dojoHome .dashboardRecentRow strong {
          color: #efefe8;
        }

        .dojoHome .dashboardPanelHeading p {
          color: #8f9690;
        }

        .dojoHome .dashboardPrimaryAction {
          color: #b5c8ba;
          border-bottom-color: #607b68;
        }

        .dojoHome .dashboardPrimaryAction:hover {
          color: #e4ebe5;
          border-bottom-color: #9bb09f;
        }

        .dojoHome .continueProgress {
          background: #303530;
        }

        .dojoHome .continueProgress > div {
          background: #6d8c77;
        }

        .dojoHome .dashboardFilters button {
          border-color: #3a403b;
          background: transparent;
          color: #969c96;
        }

        .dojoHome .dashboardFilters button:hover {
          border-color: #59635b;
          color: #d8dbd7;
        }

        .dojoHome .dashboardFilters button.active {
          border-color: #dfe3dd;
          background: #dfe3dd;
          color: #182019;
        }

        .dojoHome .dashboardRecentRow {
          border-color: #303531;
        }

        .dojoHome .dashboardRecentRow:hover {
          background: #202521;
        }

        .dojoHome .coveragePanel {
          border-color: #405247;
          background: #223329;
          color: #f0f2ed;
        }

        .dojoHome .coveragePanel .dashboardLabel,
        .dojoHome .coveragePanel p,
        .dojoHome .coveragePanel span,
        .dojoHome .coveragePanel small {
          color: #9eada2;
        }

        .dojoHome .coveragePanel h2,
        .dojoHome .coveragePanel strong,
        .dojoHome .coveragePanel a {
          color: #f1f2ed;
        }

        .dojoHome .previewMessage {
          background: #202521;
          color: #e7e9e5;
        }

        .dojoHome .previewMessage > a {
          border-color: #424a43;
          background: transparent;
          color: #c4d0c6;
        }

        .dojoHome .previewMessage > a:hover {
          border-color: #718477;
          background: #273029;
        }



        /* =====================================================
           DOJO HOME — PREMIUM DARK OVERRIDE
           ===================================================== */

        :global(body:has(.dojoHome)) {
          background: #090b0a !important;
          color: #f2f3ef !important;
        }

        :global(body:has(.dojoHome) .nav) {
          background: rgba(9, 11, 10, .96) !important;
          border-bottom: 1px solid #1e221f !important;
          box-shadow: 0 1px 0 rgba(255,255,255,.015);
        }

        :global(body:has(.dojoHome) .nav a) {
          color: #969d97 !important;
        }

        :global(body:has(.dojoHome) .nav a:hover) {
          color: #f3f4f0 !important;
        }

        :global(body:has(.dojoHome) .nav .brand) {
          color: #f3f4f0 !important;
        }

        .dojoHome {
          --dojo-ink: #f2f3ef;
          --dojo-muted: #8d958f;
          --dojo-green: #426b50;
          --dojo-green-dark: #74a181;
          --dojo-line: #262b27;
          --dojo-paper: #090b0a;
          --dojo-surface: #101310;

          color: #f2f3ef !important;
        }

        .dojoHome .dojoHomeMark span {
          background: #4c7659 !important;
        }

        .dojoHome .page-kicker,
        .dojoHome .dashboardLabel {
          color: #747e77 !important;
        }

        .dojoHome .homeHeader h1 {
          color: #f4f5f1 !important;
          text-shadow: 0 1px 18px rgba(255,255,255,.025);
        }

        .dojoHome .homeHeader p {
          color: #929a94 !important;
        }

        .dojoHome .homeStartGrid {
          border-color: #292e2a !important;
        }

        .dojoHome .homeStartCard {
          border-color: #292e2a !important;
          background: #090b0a !important;
          color: #f1f2ee !important;
        }

        .dojoHome .homeStartCard h2 {
          color: #eceee9 !important;
        }

        .dojoHome .homeStartCard p {
          color: #818983 !important;
        }

        .dojoHome .homeStartArrow {
          color: #5f876b !important;
        }

        .dojoHome .homeStartCard:hover {
          background: #111612 !important;
          color: #fff !important;
          box-shadow:
            inset 0 1px rgba(255,255,255,.025),
            inset 0 -1px rgba(255,255,255,.01) !important;
        }

        .dojoHome .homeStartCard:hover h2 {
          color: #fff !important;
        }

        .dojoHome .homeStartCard:hover p {
          color: #9ba49d !important;
        }

        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: #7e9183 !important;
        }

        .dojoHome .homeStartCard:hover .homeStartArrow {
          color: #8eae96 !important;
        }

        .dojoHome .myWorkPanel,
        .dojoHome .continuePanel,
        .dojoHome .dashboardRecent,
        .dojoHome .coveragePanel {
          border: 1px solid #282d29 !important;
          border-radius: 4px !important;
          background:
            linear-gradient(
              180deg,
              rgba(255,255,255,.018),
              rgba(255,255,255,.004)
            ),
            #101310 !important;
          color: #eef0eb !important;
          box-shadow:
            0 18px 45px rgba(0,0,0,.16),
            inset 0 1px rgba(255,255,255,.025) !important;
        }

        .dojoHome .continuePanel {
          border-left: 2px solid #52765c !important;
        }

        .dojoHome .dashboardPanelHeading h2,
        .dojoHome .dashboardRecentRow strong,
        .dojoHome .coveragePanel h2,
        .dojoHome .coveragePanel strong {
          color: #f0f2ed !important;
        }

        .dojoHome .dashboardPanelHeading p,
        .dojoHome .dashboardRecentRow p,
        .dojoHome .dashboardRecentRow span,
        .dojoHome .dashboardRecentList,
        .dojoHome .coveragePanel p,
        .dojoHome .coveragePanel span,
        .dojoHome .coveragePanel small {
          color: #858e87 !important;
        }

        .dojoHome .dashboardPrimaryAction,
        .dojoHome .coveragePanel a {
          color: #b9c9bd !important;
        }

        .dojoHome .dashboardPrimaryAction {
          border-color: #4b6251 !important;
          background: transparent !important;
        }

        .dojoHome .dashboardPrimaryAction:hover {
          color: #f0f3ef !important;
          border-color: #819b87 !important;
        }

        .dojoHome .continueProgress {
          background: #252a26 !important;
        }

        .dojoHome .continueProgress > div {
          background: #62806a !important;
        }

        .dojoHome .dashboardFilters button {
          border: 1px solid #303631 !important;
          background: #141815 !important;
          color: #858d87 !important;
        }

        .dojoHome .dashboardFilters button:hover {
          border-color: #4b534d !important;
          background: #181d19 !important;
          color: #d5d9d5 !important;
        }

        .dojoHome .dashboardFilters button.active {
          border-color: #445c4b !important;
          background: #26382c !important;
          color: #e9eeea !important;
        }

        .dojoHome .dashboardRecentRow {
          border-color: #252a26 !important;
        }

        .dojoHome .dashboardRecentRow:hover {
          background: #151a16 !important;
        }

        .dojoHome .coveragePanel {
          border-color: #2d3830 !important;
        }

        .dojoHome .coveragePanel .dashboardLabel {
          color: #728779 !important;
        }

        .dojoHome .coveragePanel a {
          color: #c1cec4 !important;
        }

        .dojoHome .coveragePanel :global(.coverage-snapshot) {
          color: #dfe4df !important;
          background: transparent !important;
        }

        .dojoHome .coveragePanel :global(.coverage-snapshot *) {
          border-color: #29302b;
        }

        .dojoHome .coveragePanel :global(.coverageTrack),
        .dojoHome .coveragePanel :global(.coverage-track) {
          background: #262d28 !important;
        }

        .dojoHome .coveragePanel :global(.coverageFill),
        .dojoHome .coveragePanel :global(.coverage-fill) {
          background: #698472 !important;
        }

        .dojoHome .previewMessage {
          border: 1px solid #292f2a !important;
          background: #131713 !important;
          color: #e5e8e4 !important;
        }

        .dojoHome .previewMessage p,
        .dojoHome .previewMessage span {
          color: #858d87 !important;
        }

        .dojoHome .previewMessage > a {
          border-color: #39423b !important;
          border-radius: 3px !important;
          background: #171c18 !important;
          color: #c5d0c7 !important;
        }

        .dojoHome .previewMessage > a:hover {
          border-color: #617367 !important;
          background: #1b211c !important;
        }



        /* =====================================================
           DOJO HOME — LIGHT / DARK / BLUE DIRECTION
           ===================================================== */

        :global(body:has(.dojoHome)) {
          background: #f4f3ee !important;
          color: #101312 !important;
        }

        /*
         * Keep the DOJO/navigation strip dark.
         * The product itself opens into the lighter workspace.
         */
        :global(body:has(.dojoHome) .nav) {
          background: #0d100f !important;
          border-bottom: 1px solid #202522 !important;
          box-shadow: none !important;
        }

        :global(body:has(.dojoHome) .nav .brand) {
          color: #ffffff !important;
        }

        :global(body:has(.dojoHome) .nav a) {
          color: #aeb4b0 !important;
        }

        :global(body:has(.dojoHome) .nav a:hover) {
          color: #ffffff !important;
        }

        .dojoHome {
          --dojo-ink: #111412;
          --dojo-muted: #666d68;
          --dojo-blue: #315cf5;
          --dojo-blue-dark: #2349cf;
          --dojo-line: #d7d8d2;
          --dojo-paper: #f4f3ee;
          --dojo-surface: #faf9f5;

          color: var(--dojo-ink) !important;
        }

        .dojoHome .dojoHomeMark span {
          background: var(--dojo-blue) !important;
        }

        .dojoHome .page-kicker,
        .dojoHome .dashboardLabel {
          color: #747a76 !important;
        }

        .dojoHome .homeHeader h1 {
          color: #101312 !important;
          text-shadow: none !important;
        }

        .dojoHome .homeHeader p {
          color: #656c67 !important;
        }

        /*
         * Practice routes: flat, architectural, no edtech cards.
         */
        .dojoHome .homeStartGrid {
          border-color: #cfd1cb !important;
        }

        .dojoHome .homeStartCard {
          border-color: #cfd1cb !important;
          background: transparent !important;
          color: #101312 !important;
          box-shadow: none !important;
        }

        .dojoHome .homeStartCard h2 {
          color: #111412 !important;
        }

        .dojoHome .homeStartCard p {
          color: #666d68 !important;
        }

        .dojoHome .homeStartArrow {
          color: var(--dojo-blue) !important;
        }

        .dojoHome .homeStartCard:hover {
          border-color: #cfd1cb !important;
          background: #ffffff !important;
          color: #101312 !important;
          transform: none !important;
          box-shadow: inset 0 -3px var(--dojo-blue) !important;
        }

        .dojoHome .homeStartCard:hover h2 {
          color: #101312 !important;
        }

        .dojoHome .homeStartCard:hover p {
          color: #5e6560 !important;
        }

        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: #737a75 !important;
        }

        .dojoHome .homeStartCard:hover .homeStartArrow {
          color: var(--dojo-blue) !important;
        }

        /*
         * Work surfaces stay light and precise.
         */
        .dojoHome .myWorkPanel,
        .dojoHome .continuePanel,
        .dojoHome .dashboardRecent,
        .dojoHome .coveragePanel {
          border: 1px solid #d4d5cf !important;
          border-radius: 4px !important;
          background: #faf9f5 !important;
          color: #111412 !important;
          box-shadow: none !important;
        }

        .dojoHome .myWorkPanel.continuePanel {
          border: 1px solid #c8cac5 !important;
          border-left: 1px solid #c8cac5 !important;
          background: #e4e5e1 !important;
          color: #111412 !important;
        }

        .dojoHome .dashboardPanelHeading h2,
        .dojoHome .dashboardRecentRow strong,
        .dojoHome .coveragePanel h2,
        .dojoHome .coveragePanel strong {
          color: #111412 !important;
        }

        .dojoHome .dashboardPanelHeading p,
        .dojoHome .dashboardRecentRow p,
        .dojoHome .dashboardRecentRow span,
        .dojoHome .dashboardRecentList,
        .dojoHome .coveragePanel p,
        .dojoHome .coveragePanel span,
        .dojoHome .coveragePanel small {
          color: #737a75 !important;
        }

        /*
         * Blue is an action colour, not decoration.
         */
        .dojoHome .dashboardPrimaryAction,
        .dojoHome .coveragePanel a {
          color: var(--dojo-blue-dark) !important;
        }

        .dojoHome .dashboardPrimaryAction {
          border: 0 !important;
          border-bottom: 1px solid #8da4f8 !important;
          border-radius: 0 !important;
          background: transparent !important;
        }

        .dojoHome .dashboardPrimaryAction:hover {
          color: var(--dojo-blue) !important;
          border-color: var(--dojo-blue) !important;
          background: transparent !important;
        }

        .dojoHome .continueProgress {
          background: #e1e2dc !important;
        }

        .dojoHome .continueProgress > div {
          background: var(--dojo-blue) !important;
        }

        .dojoHome .dashboardFilters button {
          border: 1px solid #d0d2cc !important;
          border-radius: 3px !important;
          background: transparent !important;
          color: #646b66 !important;
        }

        .dojoHome .dashboardFilters button:hover {
          border-color: #9ca19c !important;
          background: #fff !important;
          color: #171a18 !important;
        }

        .dojoHome .dashboardFilters button.active {
          border-color: var(--dojo-blue) !important;
          background: var(--dojo-blue) !important;
          color: #fff !important;
        }

        .dojoHome .dashboardRecentRow {
          border-color: #dedfd9 !important;
        }

        .dojoHome .dashboardRecentRow:hover {
          background: #f2f2ed !important;
        }

        /*
         * Coverage is no longer the giant green block.
         */
        .dojoHome .coveragePanel {
          background: #111412 !important;
          border-color: #111412 !important;
          color: #f4f5f1 !important;
        }

        .dojoHome .coveragePanel h2,
        .dojoHome .coveragePanel strong {
          color: #f4f5f1 !important;
        }

        .dojoHome .coveragePanel .dashboardLabel {
          color: #8e9690 !important;
        }

        .dojoHome .coveragePanel p,
        .dojoHome .coveragePanel span,
        .dojoHome .coveragePanel small {
          color: #929a94 !important;
        }

        .dojoHome .coveragePanel a {
          color: #ffffff !important;
        }

        .dojoHome .coveragePanel :global(.coverage-snapshot) {
          background: transparent !important;
          color: #e9ece8 !important;
        }

        .dojoHome .coveragePanel :global(.coverage-snapshot *) {
          border-color: #303632;
        }

        .dojoHome .coveragePanel :global(.coverageTrack),
        .dojoHome .coveragePanel :global(.coverage-track) {
          background: #303632 !important;
        }

        .dojoHome .coveragePanel :global(.coverageFill),
        .dojoHome .coveragePanel :global(.coverage-fill) {
          background: #4d73f6 !important;
        }

        .dojoHome .previewMessage {
          border: 1px solid #d6d7d1 !important;
          border-radius: 3px !important;
          background: #ffffff !important;
          color: #151816 !important;
        }

        .dojoHome .previewMessage p,
        .dojoHome .previewMessage span {
          color: #747b76 !important;
        }

        .dojoHome .previewMessage > a {
          border-color: var(--dojo-blue) !important;
          border-radius: 3px !important;
          background: var(--dojo-blue) !important;
          color: #fff !important;
        }

        .dojoHome .previewMessage > a:hover {
          border-color: var(--dojo-blue-dark) !important;
          background: var(--dojo-blue-dark) !important;
        }



        /* =====================================================
           DOJO HOME — PRIMARY ACTION BUTTONS
           ===================================================== */

        .dojoHome .homeStartGrid {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 14px !important;

          margin-bottom: 34px !important;

          border-top: 0 !important;
          border-bottom: 0 !important;
        }

        .dojoHome .homeStartCard {
          min-height: 190px !important;

          display: flex !important;
          flex-direction: column !important;

          padding: 24px !important;

          border: 1px solid #d4d5cf !important;
          border-radius: 14px !important;

          background: #faf9f5 !important;
          color: #111412 !important;

          box-shadow:
            0 1px 0 rgba(16,19,18,.025) !important;

          transition:
            border-color 140ms ease,
            background 140ms ease,
            box-shadow 140ms ease,
            transform 140ms ease !important;
        }

        .dojoHome .homeStartCard .dashboardLabel {
          display: none !important;
        }

        .dojoHome .homeStartCard h2 {
          margin: 0 0 10px !important;

          color: #111412 !important;

          font-size: 23px !important;
          font-weight: 650 !important;
          line-height: 1.08 !important;
          letter-spacing: -.035em !important;
        }

        .dojoHome .homeStartCard p {
          max-width: 220px !important;
          margin: 0 !important;

          color: #6a716c !important;

          font-size: 13px !important;
          line-height: 1.5 !important;
        }

        .dojoHome .homeStartArrow {
          width: 34px !important;
          height: 34px !important;

          display: flex !important;
          align-items: center !important;
          justify-content: center !important;

          margin-top: auto !important;

          border: 1px solid #d0d2cc !important;
          border-radius: 9px !important;

          background: #f4f3ee !important;
          color: #315cf5 !important;

          font-size: 17px !important;
          line-height: 1 !important;

          transition:
            background 140ms ease,
            border-color 140ms ease,
            color 140ms ease,
            transform 140ms ease !important;
        }

        .dojoHome .homeStartCard:hover {
          border-color: #315cf5 !important;
          background: #ffffff !important;

          transform: translateY(-2px) !important;

          box-shadow:
            0 10px 28px rgba(20,31,60,.075) !important;
        }

        .dojoHome .homeStartCard:hover h2 {
          color: #111412 !important;
        }

        .dojoHome .homeStartCard:hover p {
          color: #5e6560 !important;
        }

        .dojoHome .homeStartCard:hover .homeStartArrow {
          border-color: #315cf5 !important;
          background: #315cf5 !important;
          color: #ffffff !important;

          transform: translateX(2px) !important;
        }

        @media (max-width: 900px) {
          .dojoHome .homeStartGrid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr)) !important;
          }

          .dojoHome .homeStartCard {
            border: 1px solid #d4d5cf !important;
          }
        }

        @media (max-width: 600px) {
          .dojoHome .homeStartGrid {
            grid-template-columns: 1fr !important;
          }

          .dojoHome .homeStartCard {
            min-height: 155px !important;
            border: 1px solid #d4d5cf !important;
          }
        }



        /* DOJO HOME — FULL PRIMARY BUTTONS */

        .dojoHome .homeStartGrid {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 16px !important;
          margin-bottom: 34px !important;
          border: 0 !important;
        }

        .dojoHome .homeStartCard {
          min-height: 180px !important;
          width: 100% !important;

          display: flex !important;
          flex-direction: column !important;
          justify-content: flex-start !important;

          padding: 24px !important;

          border: 1px solid #d2d4ce !important;
          border-radius: 16px !important;

          background: #faf9f5 !important;
          color: #111412 !important;

          box-shadow:
            0 2px 8px rgba(17,20,18,.025) !important;

          transition:
            border-color 140ms ease,
            background 140ms ease,
            box-shadow 140ms ease,
            transform 140ms ease !important;
        }

        .dojoHome .homeStartCard .dashboardLabel {
          display: block !important;
          margin-bottom: 18px !important;
          color: #777e79 !important;
        }

        .dojoHome .homeStartCard h2 {
          margin: 0 0 10px !important;
          color: #111412 !important;
          font-size: 23px !important;
          font-weight: 650 !important;
          line-height: 1.1 !important;
          letter-spacing: -.035em !important;
        }

        .dojoHome .homeStartCard p {
          max-width: 220px !important;
          margin: 0 !important;
          color: #686f6a !important;
          font-size: 13px !important;
          line-height: 1.5 !important;
        }

        .dojoHome .homeStartArrow {
          display: none !important;
        }

        .dojoHome .homeStartCard:hover {
          border-color: #315cf5 !important;
          background: #ffffff !important;
          color: #111412 !important;
          transform: translateY(-2px) !important;

          box-shadow:
            0 10px 26px rgba(27,43,90,.08) !important;
        }

        .dojoHome .homeStartCard:hover h2 {
          color: #111412 !important;
        }

        .dojoHome .homeStartCard:hover p {
          color: #5f6661 !important;
        }

        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: #315cf5 !important;
        }

        @media (max-width: 900px) {
          .dojoHome .homeStartGrid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr)) !important;
          }

          .dojoHome .homeStartCard {
            border: 1px solid #d2d4ce !important;
          }
        }

        @media (max-width: 600px) {
          .dojoHome .homeStartGrid {
            grid-template-columns: 1fr !important;
          }

          .dojoHome .homeStartCard {
            min-height: 155px !important;
            border: 1px solid #d2d4ce !important;
          }
        }


        /* =====================================================
           DOJO HOME — DESIGN V1
           Homepage-only visual prototype
           ===================================================== */

        .dojoHome {
          --dojo-ink: #182019;
          --dojo-muted: #687069;
          --dojo-green: #294b38;
          --dojo-green-dark: #1d3829;
          --dojo-line: #d7d8d0;
          --dojo-paper: #f2f1eb;
          --dojo-surface: #f8f7f2;

          max-width: 1180px;
          padding-top: 72px;
          color: var(--dojo-ink);
        }

        .dojoHome .homeHeader {
          position: relative;
          max-width: 760px;
          margin: 0 0 54px;
          padding-left: 30px;
        }

        .dojoHome .dojoHomeMark {
          position: absolute;
          left: 0;
          top: 2px;
          width: 10px;
          height: 68px;
          display: flex;
          gap: 2px;
        }

        .dojoHome .dojoHomeMark span {
          display: block;
          width: 2px;
          height: 100%;
          background: var(--dojo-green);
        }

        .dojoHome .dojoHomeMark span:nth-child(2) {
          height: 78%;
        }

        .dojoHome .dojoHomeMark span:nth-child(3) {
          height: 48%;
        }

        .dojoHome .page-kicker,
        .dojoHome .dashboardLabel {
          color: #6f766f;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .15em;
          text-transform: uppercase;
        }

        .dojoHome .homeHeader h1 {
          max-width: 700px;
          margin: 11px 0 12px;
          font-size: clamp(46px, 6vw, 72px);
          font-weight: 650;
          line-height: .98;
          letter-spacing: -.055em;
        }

        .dojoHome .homeHeader p {
          max-width: 520px;
          color: var(--dojo-muted);
          font-size: 16px;
          line-height: 1.55;
        }

        .dojoHome .homeStartGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0;
          margin: 0 0 34px;
          border-top: 1px solid var(--dojo-line);
          border-bottom: 1px solid var(--dojo-line);
        }

        .dojoHome .homeStartCard {
          min-height: 218px;
          padding: 25px 24px 21px;
          border: 0;
          border-right: 1px solid var(--dojo-line);
          border-radius: 0;
          background: transparent;
          box-shadow: none;
          transition:
            background 120ms ease,
            color 120ms ease;
        }

        .dojoHome .homeStartCard:last-child {
          border-right: 0;
        }

        .dojoHome .homeStartCard:hover {
          border-color: var(--dojo-line);
          background: var(--dojo-green);
          color: #f8f7f2;
          transform: none;
          box-shadow: none;
        }

        .dojoHome .homeStartCard h2 {
          margin: 12px 0 9px;
          font-size: 24px;
          font-weight: 650;
          letter-spacing: -.035em;
        }

        .dojoHome .homeStartCard p {
          max-width: 220px;
          margin: 0;
          color: var(--dojo-muted);
          font-size: 13px;
          line-height: 1.55;
        }

        .dojoHome .homeStartCard:hover p,
        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: rgba(255,255,255,.66);
        }

        .dojoHome .homeStartArrow {
          margin-top: auto;
          color: var(--dojo-green);
          font-size: 19px;
        }

        .dojoHome .homeStartCard:hover .homeStartArrow {
          color: white;
          transform: translateX(4px);
        }

        .dojoHome .myWorkPanel {
          border: 1px solid var(--dojo-line);
          border-radius: 3px;
          background: rgba(248,247,242,.7);
          box-shadow: none;
        }

        .dojoHome .continuePanel {
          position: relative;
          margin: 0 0 18px;
          padding: 23px 25px 20px 29px;
          border-left: 3px solid var(--dojo-green);
        }

        .dojoHome .dashboardPanelHeading h2 {
          margin-top: 7px;
          color: var(--dojo-ink);
          font-weight: 650;
          letter-spacing: -.025em;
        }

        .dojoHome .dashboardPanelHeading p {
          color: var(--dojo-muted);
        }

        .dojoHome .dashboardPrimaryAction {
          padding: 9px 0;
          border: 0;
          border-bottom: 1px solid var(--dojo-green);
          border-radius: 0;
          background: transparent;
          color: var(--dojo-green-dark);
          font-size: 12px;
          font-weight: 800;
        }

        .dojoHome .dashboardPrimaryAction:hover {
          border-color: var(--dojo-green-dark);
          background: transparent;
        }

        .dojoHome .continueProgress {
          height: 3px;
          border-radius: 0;
          background: #dedfd8;
        }

        .dojoHome .continueProgress > div {
          border-radius: 0;
          background: var(--dojo-green);
        }

        .dojoHome .myWorkDashboardGrid {
          gap: 18px;
        }

        .dojoHome .dashboardRecent,
        .dojoHome .coveragePanel {
          border-radius: 3px;
        }

        .dojoHome .dashboardFilters button {
          border-radius: 3px;
          border-color: var(--dojo-line);
          background: transparent;
          color: #5e665f;
        }

        .dojoHome .dashboardFilters button.active {
          border-color: var(--dojo-green);
          background: var(--dojo-green);
          color: white;
        }

        .dojoHome .dashboardRecentRow {
          border-color: #e1e1db;
        }

        .dojoHome .dashboardRecentRow:hover {
          background: #f3f3ed;
        }

        .dojoHome .dashboardRecentRow strong {
          color: var(--dojo-ink);
        }

        .dojoHome .coveragePanel {
          background: var(--dojo-green);
          color: #f8f7f2;
          border-color: var(--dojo-green);
        }

        .dojoHome .coveragePanel .dashboardLabel,
        .dojoHome .coveragePanel p,
        .dojoHome .coveragePanel span,
        .dojoHome .coveragePanel small {
          color: rgba(255,255,255,.62);
        }

        .dojoHome .coveragePanel h2,
        .dojoHome .coveragePanel strong {
          color: #fff;
        }

        .dojoHome .coveragePanel a {
          color: #fff;
        }

        .dojoHome .coveragePanel :global(.coverageTrack),
        .dojoHome .coveragePanel :global(.coverage-track) {
          background: rgba(255,255,255,.14);
        }

        .dojoHome .coveragePanel :global(.coverageFill),
        .dojoHome .coveragePanel :global(.coverage-fill) {
          background: #e6eadf;
        }

        .dojoHome .previewMessage {
          border-radius: 2px;
          background: #f4f3ed;
        }

        .dojoHome .previewMessage > a {
          border-radius: 2px;
          border-color: var(--dojo-line);
          background: transparent;
          color: var(--dojo-green-dark);
        }

        .dojoHome .previewMessage > a:hover {
          border-color: var(--dojo-green);
          background: #ebece5;
        }

        @media (max-width: 900px) {
          .dojoHome {
            padding-top: 48px;
          }

          .dojoHome .homeStartGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dojoHome .homeStartCard {
            border-bottom: 1px solid var(--dojo-line);
          }

          .dojoHome .homeStartCard:nth-child(2) {
            border-right: 0;
          }

          .dojoHome .homeStartCard:nth-last-child(-n + 2) {
            border-bottom: 0;
          }
        }

        @media (max-width: 600px) {
          .dojoHome {
            padding-top: 38px;
          }

          .dojoHome .homeHeader {
            margin-bottom: 38px;
            padding-left: 22px;
          }

          .dojoHome .dojoHomeMark {
            height: 55px;
          }

          .dojoHome .homeHeader h1 {
            font-size: 44px;
          }

          .dojoHome .homeStartGrid {
            grid-template-columns: 1fr;
          }

          .dojoHome .homeStartCard {
            min-height: 150px;
            border-right: 0;
            border-bottom: 1px solid var(--dojo-line) !important;
          }

          .dojoHome .homeStartCard:last-child {
            border-bottom: 0 !important;
          }
        }


        /* =====================================================
           DOJO HOME — DEFINITIVE ACTION CARDS
           ===================================================== */

        .dojoHome .homeStartGrid {
          display: grid !important;
          grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
          gap: 16px !important;

          margin: 0 0 30px !important;
          padding: 0 !important;

          border: 0 !important;
        }

        .dojoHome .homeStartCard {
          box-sizing: border-box !important;

          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;

          width: 100% !important;
          min-width: 0 !important;
          min-height: 180px !important;

          padding: 24px !important;

          border: 1px solid #d1d3cd !important;
          border-radius: 16px !important;

          background: #faf9f5 !important;
          color: #101312 !important;

          text-decoration: none !important;
          overflow: hidden !important;

          box-shadow: none !important;

          transition:
            transform 140ms ease,
            border-color 140ms ease,
            background 140ms ease,
            box-shadow 140ms ease !important;
        }

        .dojoHome .homeStartCard > div {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;

          width: 100% !important;
          height: 100% !important;
        }

        .dojoHome .homeStartCard .dashboardLabel {
          display: block !important;

          margin: 0 0 24px !important;

          color: #747a76 !important;

          font-size: 10px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
          letter-spacing: .12em !important;
          text-transform: uppercase !important;
        }

        .dojoHome .homeStartCard h2 {
          margin: 0 0 10px !important;

          color: #101312 !important;

          font-size: 22px !important;
          font-weight: 650 !important;
          line-height: 1.1 !important;
          letter-spacing: -.025em !important;
        }

        .dojoHome .homeStartCard p {
          max-width: 230px !important;
          margin: 0 !important;

          color: #656c67 !important;

          font-size: 13px !important;
          line-height: 1.45 !important;
        }

        .dojoHome .homeStartCard:hover {
          border-color: #315cf5 !important;
          background: #ffffff !important;

          transform: translateY(-2px) !important;

          box-shadow:
            0 10px 28px rgba(28, 42, 82, .08) !important;
        }

        .dojoHome .homeStartCard:hover .dashboardLabel {
          color: #315cf5 !important;
        }

        .dojoHome .homeStartCard:hover h2 {
          color: #101312 !important;
        }

        .dojoHome .homeStartCard:hover p {
          color: #5e6560 !important;
        }

        @media (max-width: 900px) {
          .dojoHome .homeStartGrid {
            grid-template-columns:
              repeat(2, minmax(0, 1fr)) !important;
          }
        }

        @media (max-width: 600px) {
          .dojoHome .homeStartGrid {
            grid-template-columns: 1fr !important;
          }

          .dojoHome .homeStartCard {
            min-height: 150px !important;
          }
        }


      `}</style>
    </main>
  );
}
