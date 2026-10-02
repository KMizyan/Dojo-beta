'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getQuestionFlags } from '../../lib/work';

type PaperQuestion = {
  question_id: string;
  marks_awarded: number | null;
  marks_available: number | null;
};

type PaperRecord = {
  id: string;
  title: string;
  kind: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  marked_at: string | null;
  settings?: Record<string, any> | null;
  work_questions?: PaperQuestion[];
};

type PaperFilter = 'all' | 'pure' | 'stats_mechanics' | 'dojo';

function isPaper(item: PaperRecord) {
  return (
    item.kind === 'exam' ||
    item.kind === 'paper' ||
    item.kind === 'past_paper' ||
    item.kind === 'generated_paper'
  );
}

function scoreFor(item: PaperRecord) {
  const questions = item.work_questions ?? [];

  const awarded = questions.reduce(
    (sum, question) =>
      sum + Number(question.marks_awarded ?? 0),
    0
  );

  const available = questions.reduce(
    (sum, question) =>
      sum + Number(question.marks_available ?? 0),
    0
  );

  return {
    awarded,
    available,
    percentage:
      available > 0
        ? Math.round((awarded / available) * 100)
        : null
  };
}

function dateLabel(value: string | null | undefined) {
  if (!value) return '';

  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function paperArea(item: PaperRecord) {
  const storedArea =
    item.settings?.paper?.area ??
    item.settings?.area ??
    '';

  const text = `${storedArea} ${item.title}`.toLowerCase();

  if (
    text.includes('stat') ||
    text.includes('mechanic') ||
    text.includes('paper 3')
  ) {
    return 'Statistics & Mechanics';
  }

  if (text.includes('pure')) {
    return 'Pure';
  }

  return storedArea || 'Paper';
}

function paperYear(item: PaperRecord) {
  const stored =
    item.settings?.paper?.year ??
    item.settings?.year;

  if (stored) return String(stored);

  const match = item.title.match(/\b(20\d{2})\b/);

  return match?.[1] ?? null;
}

function paperNumber(item: PaperRecord) {
  const stored =
    item.settings?.paper?.paper ??
    item.settings?.paper?.number ??
    item.settings?.paperNumber;

  if (stored) return String(stored);

  const match =
    item.title.match(/paper\s*([123])/i);

  return match?.[1] ?? null;
}

export default function ReviewPage() {
  const [loading, setLoading] = useState(true);
  const [flags, setFlags] = useState<any[]>([]);
  const [papers, setPapers] = useState<PaperRecord[]>([]);
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] =
    useState<boolean|null>(null);
  const [paperFilter, setPaperFilter] =
    useState<PaperFilter>('all');

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const { data: auth, error: authError } =
          await supabase.auth.getUser();

        if (authError || !auth.user) {
          if (!active) return;

          setLoggedIn(false);
          setFlags([]);
          setPapers([]);
          setError('');
          return;
        }

        setLoggedIn(true);

        const [flagRows, workResult] =
          await Promise.all([
            getQuestionFlags(),

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
                  marks_awarded,
                  marks_available
                )
              `)
              .eq('user_id', auth.user.id)
              .order('created_at', {
                ascending: false
              })
          ]);

        if (workResult.error) {
          throw workResult.error;
        }

        if (!active) return;

        setFlags(flagRows);

        setPapers(
          ((workResult.data ?? []) as PaperRecord[])
            .filter(isPaper)
        );
      } catch (err:any) {
        if (!active) return;

        setError(
          err?.message ||
          'Could not load Review.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const filteredPapers = useMemo(() => {
    return papers.filter(item => {
      if (paperFilter === 'all') {
        return true;
      }

      if (paperFilter === 'dojo') {
        return item.kind === 'generated_paper';
      }

      const area = paperArea(item);

      if (paperFilter === 'pure') {
        return area === 'Pure';
      }

      return area === 'Statistics & Mechanics';
    });
  }, [papers, paperFilter]);

  const pastPapers = filteredPapers.filter(
    item => item.kind === 'past_paper'
  );

  const dojoPapers = filteredPapers.filter(
    item => item.kind !== 'past_paper'
  );

  const pastPapersByYear = useMemo(() => {
    const groups = new Map<string, PaperRecord[]>();

    pastPapers.forEach(item => {
      const year = paperYear(item) ?? 'Other';

      if (!groups.has(year)) {
        groups.set(year, []);
      }

      groups.get(year)!.push(item);
    });

    return Array.from(groups.entries()).sort(
      ([a], [b]) => b.localeCompare(a)
    );
  }, [pastPapers]);

  function renderPaper(item: PaperRecord) {
    const score = scoreFor(item);
    const number = paperNumber(item);

    return (
      <Link
        href={`/practice?work=${encodeURIComponent(item.id)}`}
        className="paperRow"
        key={item.id}
      >
        <div className="paperIdentity">
          <strong>{item.title}</strong>

          <span>
            {item.kind === 'generated_paper'
              ? 'DOJO Paper'
              : [
                  paperYear(item),
                  number ? `Paper ${number}` : null,
                  paperArea(item)
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </span>
        </div>

        <div className="paperDate">
          {dateLabel(
            item.marked_at ??
            item.completed_at ??
            item.created_at
          )}
        </div>

        <div className="paperScore">
          {item.status === 'marked' &&
          score.available > 0 ? (
            <>
              <strong>
                {score.awarded}/{score.available}
              </strong>

              <span>
                {score.percentage}%
              </span>
            </>
          ) : (
            <span className={`paperStatus ${
                item.status === 'marking' || item.status === 'completed'
                  ? 'paperStatusPending'
                  : 'paperStatusProgress'
              }`}>
              {item.status === 'marking'
                ? 'Marking'
                : item.status === 'completed'
                ? 'Ready to mark'
                : 'In progress'}
            </span>
          )}
        </div>

        <span className="paperArrow">→</span>
      </Link>
    );
  }

  return (
    <main className="reviewPage">
      <div className="reviewHeader">
        <div className="pageKicker">
          A-level Mathematics
        </div>

        <h1>Review</h1>

        <p>
          Revisit important questions and keep track
          of your paper results.
        </p>
      </div>

      {error && (
        <div className="errorBox">
          {error}
        </div>
      )}

      {loading ? (
        <p className="loadingText">
          Loading your review...
        </p>
      ) : loggedIn === false ? (
        <>
          <section className="reviewSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Questions
                </span>

                <h2>Questions to revisit</h2>

                <p>
                  Flag important questions while marking
                  and DOJO keeps them here for review.
                </p>
              </div>

              <div className="flagCount">
                <strong>—</strong>
                <span>saved</span>
              </div>
            </div>

            <div className="flaggedSummary">
              <div>
                <strong>
                  Build a personal review queue
                </strong>

                <span>
                  Reopen exact questions, check their
                  solutions and use them as seeds for
                  fresh Practise Similar sets.
                </span>
              </div>

              <Link
                href="/signup?next=%2Freview"
                className="primaryAction"
              >
                Create account →
              </Link>
            </div>
          </section>

          <section className="reviewSection paperSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Papers
                </span>

                <h2>Paper record</h2>

                <p>
                  Your marked past papers and DOJO papers
                  build a record here automatically.
                </p>
              </div>
            </div>

            <div className="paperFilters">
              <button type="button" className="active">
                All
              </button>
              <button type="button" disabled>
                Pure
              </button>
              <button type="button" disabled>
                Statistics & Mechanics
              </button>
              <button type="button" disabled>
                DOJO
              </button>
            </div>

            <div className="emptyState">
              <strong>
                Keep your paper history in one place
              </strong>

              <p>
                Log scores from past papers and keep
                generated-paper results so you can return
                to them from Review.
              </p>
            </div>
          </section>

          <div
            style={{
              marginTop:'18px',
              padding:'16px 18px',
              border:'1px solid #d9dedb',
              borderRadius:'12px',
              background:'#f7f9f7',
              display:'flex',
              justifyContent:'space-between',
              alignItems:'center',
              gap:'18px',
              flexWrap:'wrap'
            }}
          >
            <div>
              <strong
                style={{
                  display:'block',
                  marginBottom:'4px'
                }}
              >
                Your Review builds as you use DOJO
              </strong>

              <span
                style={{
                  color:'#667069',
                  fontSize:'12px'
                }}
              >
                Create a free account to save flags,
                paper results and personalised review.
              </span>
            </div>

            <div
              style={{
                display:'flex',
                gap:'12px',
                alignItems:'center'
              }}
            >
              <Link
                href="/login?next=%2Freview"
                style={{
                  color:'#365441',
                  fontWeight:700,
                  textDecoration:'none'
                }}
              >
                Log in
              </Link>

              <Link
                href="/signup?next=%2Freview"
                className="primaryAction"
              >
                Create account →
              </Link>
            </div>
          </div>
        </>
      ) : (
        <>
          <section className="reviewSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Questions
                </span>

                <h2>Questions to revisit</h2>

                <p>
                  Questions you flagged while marking
                  stay here until you remove them.
                </p>
              </div>

              <div className="flagCount">
                <strong>{flags.length}</strong>
                <span>flagged</span>
              </div>
            </div>

            {flags.length === 0 ? (
              <div className="emptyState">
                <strong>
                  Nothing flagged right now.
                </strong>

                <p>
                  Use “Flag for later” while marking
                  and the question will appear here.
                </p>
              </div>
            ) : (
              <div className="flaggedSummary">
                <div>
                  <strong>
                    {flags.length}{' '}
                    {flags.length === 1
                      ? 'question'
                      : 'questions'}{' '}
                    waiting for review
                  </strong>

                  <span>
                    Review the exact questions, then
                    choose which ones you want to
                    practise similar versions of.
                  </span>
                </div>

                <Link
                  href="/review/questions"
                  className="primaryAction"
                >
                  Review questions →
                </Link>
              </div>
            )}
          </section>

          <section className="reviewSection paperSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Papers
                </span>

                <h2>Paper record</h2>

                <p>
                  Your paper scores and completed
                  attempts in one place.
                </p>
              </div>
            </div>

            <div className="paperFilters">
              {([
                ['all', 'All'],
                ['pure', 'Pure'],
                [
                  'stats_mechanics',
                  'Statistics & Mechanics'
                ],
                ['dojo', 'DOJO']
              ] as [PaperFilter,string][]).map(
                ([id,label]) => (
                  <button
                    type="button"
                    key={id}
                    className={
                      paperFilter === id
                        ? 'active'
                        : ''
                    }
                    onClick={() =>
                      setPaperFilter(id)
                    }
                  >
                    {label}
                  </button>
                )
              )}
            </div>

            {filteredPapers.length === 0 ? (
              <div className="emptyState">
                <strong>
                  No papers here yet.
                </strong>

                <p>
                  Marked papers will automatically
                  build your paper record.
                </p>
              </div>
            ) : (
              <div className="paperRecord">
                {pastPapersByYear.length > 0 && (
                  <div className="paperGroup">
                    <div className="groupTitle">
                      Past Papers
                    </div>

                    {pastPapersByYear.map(
                      ([year,items]) => (
                        <div
                          className="yearGroup"
                          key={year}
                        >
                          <div className="yearLabel">
                            {year}
                          </div>

                          <div className="paperRows">
                            {items.map(renderPaper)}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {dojoPapers.length > 0 && (
                  <div className="paperGroup">
                    <div className="groupTitle">
                      DOJO Papers
                    </div>

                    <div className="paperRows">
                      {dojoPapers.map(renderPaper)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        .reviewPage {
          max-width: 1100px;
          margin: 0 auto;
          padding: 36px 24px 80px;
        }

        .reviewHeader {
          margin-bottom: 30px;
        }

        .pageKicker,
        .sectionLabel,
        .groupTitle {
          color: #777f79;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .1em;
          text-transform: uppercase;
        }

        .reviewHeader h1 {
          margin: 7px 0 7px;
          font-size: 34px;
          letter-spacing: -.025em;
        }

        .reviewHeader p,
        .sectionHeading p {
          margin: 0;
          color: #707772;
          font-size: 14px;
          line-height: 1.5;
        }

        .reviewSection {
          margin-top: 18px;
          padding: 24px;
          border: 1px solid rgba(22,33,26,.1);
          border-radius: 16px;
          background: rgba(255,255,255,.8);
        }

        .sectionHeading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 24px;
        }

        .sectionHeading h2 {
          margin: 5px 0 5px;
          font-size: 21px;
          letter-spacing: -.015em;
        }

        .flagCount {
          min-width: 72px;
          padding: 10px 12px;
          border: 1px solid #d7e0da;
          border-radius: 10px;
          background: #f4f7f5;
          text-align: center;
        }

        .flagCount strong {
          display: block;
          color: #294534;
          font-size: 19px;
        }

        .flagCount span {
          display: block;
          margin-top: 1px;
          color: #68756c;
          font-size: 10px;
          font-weight: 700;
        }

        .flaggedSummary,
        .emptyState {
          margin-top: 20px;
          padding: 18px;
          border: 1px solid rgba(22,33,26,.09);
          border-radius: 12px;
          background: #fff;
        }

        .flaggedSummary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .flaggedSummary strong,
        .flaggedSummary span {
          display: block;
        }

        .flaggedSummary strong {
          font-size: 14px;
        }

        .flaggedSummary span,
        .emptyState p {
          margin-top: 5px;
          color: #777f79;
          font-size: 12px;
          line-height: 1.45;
        }

        .emptyState strong {
          font-size: 13px;
        }

        .emptyState p {
          margin-bottom: 0;
        }

        .primaryAction {
          flex: 0 0 auto;
          padding: 10px 13px;
          border-radius: 9px;
          background: #365441;
          color: #fff;
          text-decoration: none;
          font-size: 12px;
          font-weight: 700;
        }

        .paperFilters {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin: 20px 0;
        }

        .paperFilters button {
          border: 1px solid #d9dedb;
          border-radius: 999px;
          background: #fff;
          padding: 7px 12px;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
        }

        .paperFilters button.active {
          border-color: #25362b;
          background: #25362b;
          color: #fff;
        }

        .paperRecord {
          display: grid;
          gap: 28px;
        }

        .paperGroup {
          display: grid;
          gap: 12px;
        }

        .yearGroup {
          display: grid;
          grid-template-columns: 80px minmax(0,1fr);
          gap: 14px;
          align-items: start;
        }

        .yearLabel {
          padding-top: 17px;
          color: #3c4b41;
          font-size: 13px;
          font-weight: 800;
        }

        .paperRows {
          display: grid;
          gap: 7px;
        }

        .paperRow {
          display: grid;
          grid-template-columns:
            minmax(0,1fr)
            110px
            90px
            auto;
          gap: 18px;
          align-items: center;
          min-height: 66px;
          padding: 12px 14px;
          border: 1px solid rgba(22,33,26,.09);
          border-radius: 11px;
          background: #fff;
          color: inherit;
          text-decoration: none;
        }

        .paperRow:hover {
          border-color: rgba(57,84,67,.35);
          background: #fafcfb;
        }

        .paperIdentity strong,
        .paperIdentity span {
          display: block;
        }

        .paperIdentity strong {
          font-size: 13px;
        }

        .paperIdentity span,
        .paperDate {
          margin-top: 4px;
          color: #858b87;
          font-size: 11px;
        }

        .paperScore {
          text-align: right;
        }

        .paperScore strong {
          display: block;
          color: #294534;
          font-size: 13px;
        }

        .paperScore > span {
          color: #6b766f;
          font-size: 10px;
          font-weight: 700;
        }

        .paperStatus {
          font-size: 10px !important;
        }

        .paperArrow {
          color: #66736b;
        }

        .errorBox {
          padding: 12px 14px;
          border: 1px solid #dfc5c5;
          border-radius: 10px;
          background: #fff7f7;
          font-size: 12px;
        }

        .loadingText {
          color: #707772;
        }

        @media (max-width: 750px) {
          .reviewPage {
            padding: 28px 17px 60px;
          }

          .flaggedSummary {
            align-items: flex-start;
            flex-direction: column;
          }

          .yearGroup {
            grid-template-columns: 1fr;
          }

          .yearLabel {
            padding-top: 4px;
          }

          .paperRow {
            grid-template-columns:
              minmax(0,1fr)
              auto;
          }

          .paperDate {
            display: none;
          }

          .paperScore {
            text-align: right;
          }

          .paperArrow {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
