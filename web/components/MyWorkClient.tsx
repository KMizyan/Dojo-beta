'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import CoverageSnapshot from './CoverageSnapshot';

type WorkFilter = 'all' | 'question_sets' | 'papers';

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

export default function MyWorkPage() {
  const [work, setWork] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] =
    useState<WorkFilter>('all');

  const [showMore, setShowMore] =
    useState(false);

  useEffect(() => {
    async function loadWork() {
      const { data: auth } =
        await supabase.auth.getUser();

      if (!auth.user) {
        setWork([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
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
        .order('created_at', {
          ascending: false,
        })
        .limit(50);

      if (error) {
        console.error(
          'Could not load My Work:',
          error
        );

        setWork([]);
      } else {
        setWork((data ?? []) as WorkItem[]);
      }

      setLoading(false);
    }

    loadWork();
  }, []);

  const inProgress = useMemo(
    () =>
      work.filter(
        item =>
          item.status === 'in_progress' ||
          item.status === 'completed' ||
          item.status === 'marking'
      ),
    [work]
  );

  const continueItem =
    inProgress.length > 0
      ? inProgress[0]
      : null;

  const filteredRecent = useMemo(() => {
    return work.filter(item => {
      if (filter === 'papers') {
        return isPaper(item);
      }

      if (filter === 'question_sets') {
        return !isPaper(item);
      }

      return true;
    });
  }, [work, filter]);

  const visibleRecent = showMore
    ? filteredRecent
    : filteredRecent.slice(0, 3);

  return (
    <main className="work-page">
      <div className="homeHeader">
        <div className="page-kicker">
          A-level Mathematics
        </div>
        <p>
          Choose what you want to work on or pick up where you left off.
        </p>
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

          <span className="homeStartArrow">
            →
          </span>
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

          <span className="homeStartArrow">
            →
          </span>
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

          <span className="homeStartArrow">
            →
          </span>
        </Link>
      </section>

      {!loading && continueItem && (
        <section className="myWorkPanel continuePanel">
          <div className="dashboardPanelHeading">
            <div>
              <span className="dashboardLabel">
                Continue
              </span>

              <h2>{continueItem.title}</h2>

              <p>
                {workTypeLabel(continueItem)}

                {progressFor(continueItem).total > 0
                  ? ` · ${progressFor(continueItem).current}/${progressFor(continueItem).total} questions`
                  : ''}
              </p>
            </div>

            <Link
              className="dashboardPrimaryAction"
              href={`/practice?work=${encodeURIComponent(
                continueItem.id
              )}`}
            >
              {continueItem.status === 'in_progress'
                ? 'Resume →'
                : continueItem.status === 'marking'
                ? 'Continue marking →'
                : 'Mark →'}
            </Link>
          </div>

          {continueItem.status === 'in_progress' &&
            progressFor(continueItem).total > 0 && (
              <div className="continueProgress">
                <div
                  style={{
                    width: `${
                      progressFor(continueItem).percent
                    }%`,
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

                <h2>Latest</h2>
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
                  <Link
                    href={`/practice?work=${encodeURIComponent(
                      item.id
                    )}`}
                    className="dashboardRecentRow"
                    key={item.id}
                  >
                    <div>
                      <strong>{item.title}</strong>

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
                        <span className={`statusBadge status-${item.status}`}>
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
                );
              })}
            </div>

            {filteredRecent.length > 3 && (
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
              <CoverageSnapshot />
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
          grid-template-columns: repeat(3, minmax(0, 1fr));
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
          border: 1px solid #cbd6ce;
          border-radius: 9px;
          background: #f1f5f2;
          color: #294534 !important;
          margin: 0 !important;
        }

        .scoreBadge strong {
          display: inline;
          overflow: visible;
          color: #294534;
          font-size: 14px;
          line-height: 1;
        }

        .scoreBadge small {
          color: #607067;
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
          border-color: #d8d0bc;
          background: #faf7ef;
          color: #6f6040 !important;
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

      `}</style>
    </main>
  );
}
