'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getQuestionFlags } from '../../lib/work';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

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
  archived_at: string | null;
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
  const [openWorkMenu, setOpenWorkMenu] =
    useState<string|null>(null);
  const [questionSetHistoryTab, setQuestionSetHistoryTab] =
    useState<'marking' | 'in_progress' | 'finished' | 'archived'>('in_progress');
  const [paperHistoryTab, setPaperHistoryTab] =
    useState<'marking' | 'in_progress' | 'finished' | 'archived'>('in_progress');

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
                archived_at,
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
            .filter(item => item.settings?.draft !== true)
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

  const flagIds = useMemo(
    () => new Set(flags.map(flag => String(flag.question_id))),
    [flags]
  );

  const questionSetWork = useMemo(
    () => papers.filter(
      item => !isPaper(item) && !item.archived_at
    ),
    [papers]
  );

  const paperWork = useMemo(
    () => papers.filter(
      item => isPaper(item) && !item.archived_at
    ),
    [papers]
  );

  const archivedQuestionSetWork = useMemo(
    () => papers.filter(
      item => !isPaper(item) && Boolean(item.archived_at)
    ),
    [papers]
  );

  const archivedPaperWork = useMemo(
    () => papers.filter(
      item => isPaper(item) && Boolean(item.archived_at)
    ),
    [papers]
  );

  const flaggedQuestionSetWork = useMemo(
    () => questionSetWork.filter(
      item => flaggedQuestionsFor(item).length > 0
    ),
    [questionSetWork, flagIds]
  );

  const otherQuestionSetWork = useMemo(
    () => questionSetWork.filter(
      item => flaggedQuestionsFor(item).length === 0
    ),
    [questionSetWork, flagIds]
  );

  const markingQuestionSetWork = useMemo(
    () => otherQuestionSetWork.filter(
      item => item.status === 'marking'
    ),
    [otherQuestionSetWork]
  );

  const inProgressQuestionSetWork = useMemo(
    () => otherQuestionSetWork.filter(
      item =>
        item.status !== 'marking' &&
        item.status !== 'marked' &&
        item.status !== 'completed'
    ),
    [otherQuestionSetWork]
  );

  const finishedQuestionSetWork = useMemo(
    () => otherQuestionSetWork.filter(
      item =>
        item.status === 'marked' ||
        item.status === 'completed'
    ),
    [otherQuestionSetWork]
  );

  const visibleQuestionSetHistory =
    questionSetHistoryTab === 'marking'
      ? markingQuestionSetWork
      : questionSetHistoryTab === 'in_progress'
      ? inProgressQuestionSetWork
      : questionSetHistoryTab === 'finished'
      ? finishedQuestionSetWork
      : archivedQuestionSetWork;

  const flaggedPaperWork = useMemo(
    () => paperWork.filter(
      item => flaggedQuestionsFor(item).length > 0
    ),
    [paperWork, flagIds]
  );

  const otherPaperWork = useMemo(
    () => paperWork.filter(
      item => flaggedQuestionsFor(item).length === 0
    ),
    [paperWork, flagIds]
  );

  const markingPaperWork = useMemo(
    () => otherPaperWork.filter(
      item => item.status === 'marking'
    ),
    [otherPaperWork]
  );

  const inProgressPaperWork = useMemo(
    () => otherPaperWork.filter(
      item =>
        item.status !== 'marking' &&
        item.status !== 'marked' &&
        item.status !== 'completed'
    ),
    [otherPaperWork]
  );

  const finishedPaperWork = useMemo(
    () => otherPaperWork.filter(
      item =>
        item.status === 'marked' ||
        item.status === 'completed'
    ),
    [otherPaperWork]
  );

  const visiblePaperHistory =
    paperHistoryTab === 'marking'
      ? markingPaperWork
      : paperHistoryTab === 'in_progress'
      ? inProgressPaperWork
      : paperHistoryTab === 'finished'
      ? finishedPaperWork
      : archivedPaperWork;

  function workTypeLabel(item: PaperRecord) {
    return isPaper(item) ? 'Paper' : 'Question Set';
  }

  function flaggedQuestionsFor(item: PaperRecord) {
    return (item.work_questions ?? []).filter(question =>
      flagIds.has(String(question.question_id))
    );
  }

  async function setWorkArchived(
    id: string,
    archived: boolean
  ) {
    const { data: auth } = await supabase.auth.getUser();

    if (!auth.user) return;

    const archivedAt =
      archived ? new Date().toISOString() : null;

    const { error: archiveError } = await supabase
      .from('work_items')
      .update({ archived_at: archivedAt })
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (archiveError) {
      console.error(
        archived
          ? 'Could not archive work item:'
          : 'Could not restore work item:',
        archiveError
      );
      return;
    }

    setPapers(current =>
      current.map(item =>
        item.id === id
          ? { ...item, archived_at: archivedAt }
          : item
      )
    );
  }

  function renderWorkItem(item: PaperRecord) {
    const score = scoreFor(item);
    const flagged = flaggedQuestionsFor(item);
    const totalQuestions =
      item.work_questions?.length ?? 0;

    const result =
      item.status === 'marked' && score.available > 0
        ? `${score.awarded}/${score.available} - ${score.percentage}%`
        : item.status === 'in_progress'
        ? 'In progress'
        : item.status === 'marking'
        ? 'Marking'
        : item.status === 'completed'
        ? 'Ready to mark'
        : 'Completed';

    return (
      <div
        className="reviewWorkRowShell"
        key={item.id}
      >
        <Link
          href={`/practice?work=${encodeURIComponent(
            item.id
          )}`}
          className="reviewWorkRow"
        >
        <div className="reviewWorkMain">
          <strong className="reviewWorkTitle">
            {item.title}
          </strong>

          <div className="reviewWorkMeta">
            <span>
              {workTypeLabel(item)}
            </span>

            <span aria-hidden="true">
              &middot;
            </span>

            <span>
              {totalQuestions}{' '}
              {totalQuestions === 1
                ? 'question'
                : 'questions'}
            </span>

            <span aria-hidden="true">
              &middot;
            </span>

            <span>
              {dateLabel(
                item.marked_at ??
                item.completed_at ??
                item.created_at
              )}
            </span>
          </div>
        </div>

        <div className="reviewWorkStatus">
          <strong
            className={
              item.status === 'marked'
                ? 'reviewResultBadge reviewResultScore'
                : item.status === 'in_progress'
                ? 'reviewResultBadge reviewResultProgress'
                : item.status === 'marking'
                ? 'reviewResultBadge reviewResultMarking'
                : 'reviewResultBadge reviewResultReady'
            }
          >
            {result}
          </strong>

          {flagged.length > 0 ? (
            <span className="reviewWorkFlagged">
              {flagged.length}{' '}
              {flagged.length === 1
                ? 'question flagged'
                : 'questions flagged'}
            </span>
          ) : null}
        </div>

          <span
            className="reviewWorkArrow"
            aria-hidden="true"
          >
            &rsaquo;
          </span>
        </Link>

        <div className="reviewWorkMenu">
          <button
            type="button"
            className="reviewWorkMenuButton"
            aria-label="Work item options"
            title="Options"
            aria-expanded={openWorkMenu === item.id}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              setOpenWorkMenu(current =>
                current === item.id
                  ? null
                  : item.id
              );
            }}
          >
            <span aria-hidden="true">&bull;&bull;&bull;</span>
          </button>

          {openWorkMenu === item.id && (
            <div className="reviewWorkMenuPopup">
              <button
                type="button"
                onClick={async (event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  setOpenWorkMenu(null);

                  await setWorkArchived(
                    item.id,
                    !Boolean(item.archived_at)
                  );
                }}
              >
                {item.archived_at
                  ? 'Restore'
                  : 'Archive'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

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
        <div className="reviewLoggedOut">
          <section className="reviewAdvertHero">
            <div className="reviewAdvertHeroCopy">
              <span className="reviewAdvertEyebrow">
                Your personal review space
              </span>

              <h2>
                Everything worth revisiting.
                Organised in one place.
              </h2>

              <p>
                Question sets. Papers. Flagged questions.
                Review keeps your work together so you can
                return to what matters and practise it again.
              </p>

              <div className="reviewAdvertActions">
                <Link
                  href="/signup?next=%2Freview"
                  className="reviewAdvertPrimary"
                >
                  Create free account
                </Link>

                <Link
                  href="/login?next=%2Freview"
                  className="reviewAdvertSecondary"
                >
                  Log in
                </Link>
              </div>
            </div>

            <div
              className="reviewAdvertPreview"
              aria-hidden="true"
            >
              <div className="reviewPreviewTop">
                <span>REVIEW</span>
                <strong>5 questions flagged</strong>
              </div>

              <div className="reviewPreviewQuestion">
                <div>
                  <strong>Algebra &amp; Functions</strong>
                  <span>
                    Question Set &middot; 12 questions
                  </span>
                  <b className="reviewPreviewFlagged">
                    3 flagged &middot; Q4 &middot; Q7 &middot; Q11
                  </b>
                </div>

                <span className="reviewPreviewArrow">
                  &rarr;
                </span>
              </div>

              <div className="reviewPreviewQuestion">
                <div>
                  <strong>DOJO Paper &middot; Pure</strong>
                  <span>
                    68 / 80
                  </span>
                  <b className="reviewPreviewFlagged">
                    2 flagged &middot; Q6 &middot; Q14
                  </b>
                </div>

                <span className="reviewPreviewArrow">
                  &rarr;
                </span>
              </div>

              <div className="reviewPreviewAction">
                Review flagged questions
                <span>&rarr;</span>
              </div>
            </div>
          </section>

          <div className="reviewAdvertFeatures">
            <section className="reviewAdvertFeature">
              <span className="reviewAdvertNumber">01</span>

              <div>
                <span className="reviewAdvertFeatureLabel">
                  Organise
                </span>

                <h3>Keep your work together</h3>

                <p>
                  Question sets, papers and results stay
                  organised in Review.
                </p>
              </div>
            </section>

            <section className="reviewAdvertFeature">
              <span className="reviewAdvertNumber">02</span>

              <div>
                <span className="reviewAdvertFeatureLabel">
                  Revisit
                </span>

                <h3>Go back to exact questions</h3>

                <p>
                  Flag what matters and return to those
                  questions when you&apos;re ready.
                </p>
              </div>
            </section>

            <section className="reviewAdvertFeature">
              <span className="reviewAdvertNumber">03</span>

              <div>
                <span className="reviewAdvertFeatureLabel">
                  Practice
                </span>

                <h3>Don&apos;t just revisit it. Master it.</h3>

                <p>
                  Turn a flagged question into fresh practice
                  built around the same underlying skill.
                </p>
              </div>
            </section>
          </div>

          <section className="reviewSimilarDemo">
            <div className="reviewSimilarIntro">
              <span className="reviewAdvertEyebrow">
                Practise Similar
              </span>

              <h2>
                Same skill.
                Fresh question.
              </h2>

              <p>
                A question you want to revisit can become
                another meaningful attempt at the same type
                of problem.
              </p>


            </div>

            <div
              className="reviewSimilarVisual"
              aria-hidden="true"
            >
              <div className="reviewSimilarQuestion">
                <div className="reviewSimilarQuestionHead">
                  <span>FLAGGED QUESTION</span>
                  <strong>Integration</strong>
                </div>

                <div className="reviewSimilarExamQuestion">
                  <div className="reviewSimilarExamNumber">1.</div>

                  <div className="reviewSimilarExamBody">
                    <p>Given that</p>

                    <div className="reviewSimilarDisplayMath">
                      <BlockMath math={String.raw`\frac{dy}{dx}=6x(1+x^2)^4`} />
                    </div>

                    <p>
                      and <InlineMath math={String.raw`y=3`} /> when{' '}
                      <InlineMath math={String.raw`x=0`} />, find{' '}
                      <InlineMath math="y" /> in terms of{' '}
                      <InlineMath math="x" />.
                    </p>
                  </div>

                  <div className="reviewSimilarExamMarks">(4)</div>
                </div>
              </div>

              <div className="reviewSimilarConnector">
                <span className="reviewSimilarArrow">
                  &rarr;
                </span>

                <div className="reviewSimilarPill">
                  PRACTISE SIMILAR
                </div>

                <span className="reviewSimilarArrow">
                  &rarr;
                </span>
              </div>

              <div className="reviewSimilarQuestion fresh">
                <div className="reviewSimilarQuestionHead">
                  <span>FRESH QUESTION</span>
                  <strong>Same architecture</strong>
                </div>

                <div className="reviewSimilarExamQuestion">
                  <div className="reviewSimilarExamNumber">1.</div>

                  <div className="reviewSimilarExamBody">
                    <p>
                      The curve <InlineMath math="C" /> passes through{' '}
                      <InlineMath math={String.raw`(1,5)`} /> and satisfies
                    </p>

                    <div className="reviewSimilarDisplayMath">
                      <BlockMath math={String.raw`\frac{dy}{dx}=\frac{8x}{(3+x^2)^3}`} />
                    </div>

                    <p>
                      Find an equation for <InlineMath math="C" />.
                    </p>
                  </div>

                  <div className="reviewSimilarExamMarks">(4)</div>
                </div>

                <div className="reviewSimilarNext">
                  Another similar question
                  <span>&rarr;</span>
                </div>
              </div>
            </div>
          </section>

          <section className="reviewAdvertClosing">
            <div>
              <span className="reviewAdvertEyebrow">
                Your workspace
              </span>

              <h2>Your Review builds as you use DOJO.</h2>

              <p>
                Create a free account to start building yours.
              </p>
            </div>

            <div className="reviewAdvertActions">
              <Link
                href="/signup?next=%2Freview"
                className="reviewAdvertPrimary"
              >
                Create free account
              </Link>

              <Link
                href="/login?next=%2Freview"
                className="reviewAdvertSecondary"
              >
                Log in
              </Link>
            </div>
          </section>
        </div>
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

          <section className="reviewSection reviewWorkSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Question Sets
                </span>

                <h2>Question Sets</h2>
              </div>

              <div className="workCount">
                <strong>
                  {questionSetWork.length}
                </strong>
                <span>sets</span>
              </div>
            </div>

            {flaggedQuestionSetWork.length > 0 ? (
              <div className="reviewPriorityGroup">
                <div className="reviewGroupHeading">
                  <div>
                    <strong>Needs review</strong>
                  </div>

                  <span className="reviewGroupCount">
                    {flaggedQuestionSetWork.reduce(
                      (total,item) =>
                        total + flaggedQuestionsFor(item).length,
                      0
                    )}{' '}
                    flagged
                  </span>
                </div>

                <div className="reviewWorkList">
                  {flaggedQuestionSetWork.map(
                    renderWorkItem
                  )}
                </div>
              </div>
            ) : (
              <div className="reviewAllClear reviewAllClearCompact">
                <strong>No flags</strong>
              </div>
            )}

            {otherQuestionSetWork.length > 0 && (
              <details className="reviewHistoryGroup">
                <summary>
                  <div>
                    <strong>History</strong>
                  </div>

                  <span className="reviewHistoryCount">
                    {otherQuestionSetWork.length}
                  </span>
                </summary>

                <div className="reviewHistoryTabs">
                  <button
                    type="button"
                    className={
                      questionSetHistoryTab === 'in_progress'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setQuestionSetHistoryTab('in_progress')
                    }
                  >
                    <span>In progress</span>
                    <strong>{inProgressQuestionSetWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      questionSetHistoryTab === 'marking'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setQuestionSetHistoryTab('marking')
                    }
                  >
                    <span>Marking</span>
                    <strong>{markingQuestionSetWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      questionSetHistoryTab === 'finished'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setQuestionSetHistoryTab('finished')
                    }
                  >
                    <span>Finished</span>
                    <strong>{finishedQuestionSetWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      questionSetHistoryTab === 'archived'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setQuestionSetHistoryTab('archived')
                    }
                  >
                    <span>Archived</span>
                  </button>
                </div>

                {visibleQuestionSetHistory.length > 0 ? (
                  <div className="reviewWorkList reviewTabbedWorkList">
                    {visibleQuestionSetHistory.map(
                      renderWorkItem
                    )}
                  </div>
                ) : (
                  <div className="reviewTabEmpty">
                    {questionSetHistoryTab === 'marking'
                      ? 'No Question Sets are currently being marked.'
                      : questionSetHistoryTab === 'in_progress'
                      ? 'No Question Sets are currently in progress.'
                      : questionSetHistoryTab === 'finished'
                      ? 'No finished Question Sets yet.'
                      : 'No archived Question Sets.'}
                  </div>
                )}
              </details>
            )}
          </section>

          <section className="reviewSection reviewWorkSection">
            <div className="sectionHeading">
              <div>
                <span className="sectionLabel">
                  Papers
                </span>

                <h2>Papers</h2>
              </div>

              <div className="workCount">
                <strong>
                  {paperWork.length}
                </strong>
                <span>papers</span>
              </div>
            </div>

            {flaggedPaperWork.length > 0 ? (
              <div className="reviewPriorityGroup">
                <div className="reviewGroupHeading">
                  <div>
                    <strong>Needs review</strong>
                  </div>

                  <span className="reviewGroupCount">
                    {flaggedPaperWork.reduce(
                      (total,item) =>
                        total + flaggedQuestionsFor(item).length,
                      0
                    )}{' '}
                    flagged
                  </span>
                </div>

                <div className="reviewWorkList">
                  {flaggedPaperWork.map(
                    renderWorkItem
                  )}
                </div>
              </div>
            ) : (
              <div className="reviewAllClear reviewAllClearCompact">
                <strong>No flags</strong>
              </div>
            )}

            {otherPaperWork.length > 0 && (
              <details className="reviewHistoryGroup">
                <summary>
                  <div>
                    <strong>History</strong>
                  </div>

                  <span className="reviewHistoryCount">
                    {otherPaperWork.length}
                  </span>
                </summary>

                <div className="reviewHistoryTabs">
                  <button
                    type="button"
                    className={
                      paperHistoryTab === 'in_progress'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setPaperHistoryTab('in_progress')
                    }
                  >
                    <span>In progress</span>
                    <strong>{inProgressPaperWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      paperHistoryTab === 'marking'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setPaperHistoryTab('marking')
                    }
                  >
                    <span>Marking</span>
                    <strong>{markingPaperWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      paperHistoryTab === 'finished'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setPaperHistoryTab('finished')
                    }
                  >
                    <span>Finished</span>
                    <strong>{finishedPaperWork.length}</strong>
                  </button>

                  <button
                    type="button"
                    className={
                      paperHistoryTab === 'archived'
                        ? 'reviewHistoryTab active'
                        : 'reviewHistoryTab'
                    }
                    onClick={() =>
                      setPaperHistoryTab('archived')
                    }
                  >
                    <span>Archived</span>
                  </button>
                </div>

                {visiblePaperHistory.length > 0 ? (
                  <div className="reviewWorkList reviewTabbedWorkList">
                    {visiblePaperHistory.map(
                      renderWorkItem
                    )}
                  </div>
                ) : (
                  <div className="reviewTabEmpty">
                    {paperHistoryTab === 'marking'
                      ? 'No Papers are currently being marked.'
                      : paperHistoryTab === 'in_progress'
                      ? 'No Papers are currently in progress.'
                      : paperHistoryTab === 'finished'
                      ? 'No finished Papers yet.'
                      : 'No archived Papers.'}
                  </div>
                )}
              </details>
            )}
          </section>
        </>
      )}

      <style jsx>{`
        /* Review visual simplification */
        .reviewWorkSection :global(.sectionHeading) {
          margin-bottom:18px;
        }

        .reviewWorkSection :global(.sectionHeading h2) {
          margin-bottom:0;
        }

        .reviewWorkSection :global(.reviewPriorityGroup) {
          padding:14px 16px 16px;
        }

        .reviewWorkSection :global(.reviewGroupHeading) {
          min-height:28px;
          margin-bottom:10px;
        }

        .reviewWorkSection :global(.reviewGroupHeading > div) {
          display:flex;
          align-items:center;
        }

        .reviewWorkSection :global(.reviewGroupHeading > div > span) {
          display:none;
        }

        .reviewWorkSection :global(.reviewGroupCount) {
          width:auto;
          min-width:0;
          height:auto;
          padding:5px 9px;
          border-radius:999px;
          font-size:10px;
          line-height:1;
        }

        .reviewAllClearCompact {
          display:flex;
          align-items:center;
          gap:8px;
          min-height:0;
          padding:10px 12px;
          border:0;
          background:transparent;
        }

        .reviewAllClearCompact > span:not(.reviewClearMark) {
          display:none;
        }

        .reviewClearMark {
          display:flex;
          align-items:center;
          justify-content:center;
          width:18px;
          height:18px;
          border-radius:999px;
          background:#edf4ef;
          color:#315b42;
          font-size:11px;
          font-weight:800;
        }

        .reviewAllClearCompact strong {
          font-size:11px;
          color:#536159;
        }

        .reviewWorkSection :global(.reviewHistoryGroup) {
          margin-top:8px;
        }

        .reviewWorkSection :global(.reviewHistoryGroup > summary) {
          min-height:52px;
          padding-top:10px;
          padding-bottom:10px;
        }

        .reviewWorkSection :global(.reviewHistoryGroup > summary > div > span) {
          display:none;
        }

        .reviewWorkSection :global(.reviewHistoryTabs) {
          padding:8px 10px;
        }

        .reviewWorkSection :global(.reviewHistoryTab) {
          min-height:36px;
        }

        .reviewWorkSection :global(.reviewTabbedWorkList) {
          padding:10px;
          gap:7px;
        }

        .reviewWorkSection :global(.reviewWorkRow) {
          min-height:64px;
          padding-top:12px;
          padding-bottom:12px;
        }


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

        /* Review organised work */
        .workCount {
          min-width:72px;
          padding:10px 12px;
          border:1px solid #d7e0da;
          border-radius:10px;
          background:#f4f7f5;
          text-align:center;
        }

        .workCount strong {
          display:block;
          color:#294534;
          font-size:19px;
          line-height:1;
        }

        .workCount span {
          display:block;
          margin-top:5px;
          color:#68756c;
          font-size:10px;
          font-weight:700;
        }

        .reviewPriorityGroup {
          margin-top:22px;
          padding:16px;
          border:1px solid #d5ded8;
          border-radius:12px;
          background:#f7faf8;
        }

        .reviewGroupHeading {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          padding:0 2px 12px;
        }

        .reviewGroupHeading > div > strong,
        .reviewGroupHeading > div > span {
          display:block;
        }

        .reviewGroupHeading > div > strong {
          color:#18251d;
          font-size:12px;
          font-weight:850;
        }

        .reviewGroupHeading > div > span {
          margin-top:3px;
          color:#747d77;
          font-size:10px;
        }

        .reviewGroupCount {
          display:flex;
          align-items:center;
          justify-content:center;
          min-width:28px;
          height:28px;
          padding:0 8px;
          border-radius:999px;
          background:#e6eee9;
          color:#294534;
          font-size:11px;
          font-weight:850;
        }

        .reviewPriorityGroup .reviewWorkList {
          margin-top:0;
        }

        .reviewHistoryGroup {
          margin-top:14px;
          border:1px solid #e0e5e1;
          border-radius:11px;
          background:#fff;
          overflow:hidden;
        }

        .reviewHistoryGroup > summary {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          padding:16px 17px;
          cursor:pointer;
          list-style:none;
          user-select:none;
        }

        .reviewHistoryGroup > summary::-webkit-details-marker {
          display:none;
        }

        .reviewHistoryGroup > summary > div > strong,
        .reviewHistoryGroup > summary > div > span {
          display:block;
        }

        .reviewHistoryGroup > summary > div > strong {
          color:#1d2720;
          font-size:12px;
        }

        .reviewHistoryGroup > summary > div > span {
          margin-top:3px;
          color:#7a827c;
          font-size:10px;
        }

        .reviewHistoryGroup > summary::after {
          content:'';
          width:7px;
          height:7px;
          margin-left:8px;
          border-right:1.5px solid #657168;
          border-bottom:1.5px solid #657168;
          transform:rotate(45deg);
          transition:transform .15s ease;
          flex:0 0 auto;
        }

        .reviewHistoryGroup[open] > summary::after {
          transform:rotate(225deg);
        }

        .reviewHistoryCount {
          margin-left:auto;
          padding:4px 8px;
          border-radius:999px;
          background:#f0f3f1;
          color:#647067;
          font-size:10px;
          font-weight:800;
        }

        .reviewHistoryTabs {
          display:grid;
          grid-template-columns:repeat(4,1fr);
          gap:6px;
          margin:0 10px;
          padding:10px;
          border-top:1px solid #e5e9e6;
          border-bottom:1px solid #e5e9e6;
          background:#f8faf9;
        }

        .reviewHistoryTab {
          display:flex;
          align-items:center;
          justify-content:center;
          gap:8px;
          min-height:40px;
          padding:8px 12px;
          border:1px solid transparent;
          border-radius:8px;
          background:transparent;
          color:#68736c;
          cursor:pointer;
          font-size:11px;
          font-weight:750;
        }

        .reviewHistoryTab:hover {
          background:#fff;
          color:#18251d;
        }

        .reviewHistoryTab.active {
          border-color:#ccd8d0;
          background:#fff;
          color:#18251d;
          box-shadow:0 1px 2px rgba(18,30,21,.04);
        }

        .reviewHistoryTab strong {
          display:flex;
          align-items:center;
          justify-content:center;
          min-width:21px;
          height:21px;
          padding:0 6px;
          border-radius:999px;
          background:#edf1ee;
          color:#657168;
          font-size:9px;
        }

        .reviewHistoryTab.active strong {
          background:#e6eee9;
          color:#294534;
        }

        .reviewTabbedWorkList {
          padding-top:10px !important;
        }

        .reviewTabEmpty {
          margin:10px;
          padding:20px 16px;
          border-radius:8px;
          background:#fafbfa;
          color:#7b847e;
          text-align:center;
          font-size:11px;
        }

        .reviewHistoryGroup .reviewWorkList {
          margin:0;
          padding:0 10px 10px;
        }

        .reviewAllClear {
          display:flex;
          flex-direction:column;
          gap:4px;
          margin-top:22px;
          padding:15px 16px;
          border:1px solid #dce4df;
          border-radius:10px;
          background:#f8faf9;
        }

        .reviewAllClear strong {
          color:#294534;
          font-size:12px;
        }

        .reviewAllClear span {
          color:#78817b;
          font-size:10px;
        }

        .reviewWorkList {
          display:grid;
          gap:8px;
          margin-top:22px;
        }

        :global(.reviewWorkRowShell) {
          position:relative;
        }

        :global(.reviewWorkRowShell .reviewWorkRow) {
          padding-right:96px;
        }

        :global(.reviewWorkMenu) {
          position:absolute;
          top:7px;
          right:8px;
          z-index:20;
          transform:none;
          margin:0;
        }

        :global(.reviewWorkMenuButton) {
          display:flex;
          align-items:center;
          justify-content:center;
          width:26px;
          height:24px;
          margin:0;
          padding:0;
          border:0;
          border-radius:6px;
          background:transparent;
          color:#657168;
          cursor:pointer;
          font:inherit;
          line-height:1;
        }

        :global(.reviewWorkMenuButton:hover),
        :global(.reviewWorkMenuButton[aria-expanded="true"]) {
          background:#eef2ef;
          color:#17231b;
        }

        :global(.reviewWorkMenuButton > span) {
          display:block;
          font-size:10px;
          font-weight:800;
          line-height:1;
          letter-spacing:.5px;
          transform:translateY(-1px);
        }

        :global(.reviewWorkMenuPopup) {
          position:absolute;
          top:27px;
          right:0;
          z-index:40;
          min-width:120px;
          padding:5px;
          border:1px solid #dce2de;
          border-radius:9px;
          background:#fff;
          box-shadow:0 10px 28px rgba(20,30,23,.14);
        }

        :global(.reviewWorkMenuPopup button) {
          display:block;
          width:100%;
          padding:9px 10px;
          border:0;
          border-radius:6px;
          background:transparent;
          color:#202822;
          cursor:pointer;
          text-align:left;
          font:inherit;
          font-size:11px;
          font-weight:700;
        }

        :global(.reviewWorkMenuPopup button:hover) {
          background:#f1f4f2;
        }

        :global(.reviewWorkRow) {
          display:grid;
          grid-template-columns:
            minmax(0,1fr)
            auto
            20px;
          gap:24px;
          align-items:center;
          min-height:78px;
          padding:15px 17px;
          border:1px solid #e0e5e1;
          border-radius:10px;
          background:#fff;
          color:#171b18;
          text-decoration:none;
          transition:
            border-color .15s ease,
            background .15s ease,
            transform .15s ease;
        }

        :global(.reviewWorkRow:hover) {
          border-color:#b9c9be;
          background:#fafcfb;
          transform:translateY(-1px);
        }

        :global(.reviewWorkMain) {
          min-width:0;
        }

        :global(.reviewWorkTitle) {
          display:block;
          overflow:hidden;
          color:#171b18;
          font-size:14px;
          font-weight:800;
          text-overflow:ellipsis;
          white-space:nowrap;
        }

        :global(.reviewWorkMeta) {
          display:flex;
          flex-wrap:wrap;
          gap:5px;
          align-items:center;
          margin-top:6px;
          color:#747d77;
          font-size:10px;
        }

        :global(.reviewWorkStatus) {
          min-width:130px;
          text-align:right;
        }

        :global(.reviewWorkStatus > strong) {
          display:block;
          color:#1d2c22;
          font-size:12px;
          font-weight:800;
        }

        :global(.reviewWorkFlagged) {
          display:block;
          margin-top:5px;
          color:#124fad;
          font-size:10px;
          font-weight:800;
        }

        :global(.reviewWorkClear) {
          display:block;
          margin-top:5px;
          color:#89918c;
          font-size:10px;
          font-weight:700;
        }

        :global(.reviewWorkArrow) {
          color:#778079;
          font-size:22px;
          line-height:1;
        }

        .reviewWorkEmpty {
          display:flex;
          flex-direction:column;
          gap:4px;
          margin-top:20px;
          padding:20px;
          border:1px dashed #d6ddd8;
          border-radius:10px;
          background:#fafbfa;
        }

        .reviewWorkEmpty strong {
          font-size:12px;
        }

        .reviewWorkEmpty span {
          color:#747d77;
          font-size:11px;
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


        /* Logged-out Review advert */
        .reviewLoggedOut {
          display: grid;
          gap: 20px;
        }

        .reviewAdvertHero {
          display: grid;
          grid-template-columns:
            minmax(0, 1.05fr)
            minmax(340px, .95fr);
          gap: 54px;
          align-items: center;
          padding: 42px;
          border: 1px solid rgba(22,33,26,.1);
          border-radius: 16px;
          background: #f8f8f5;
        }

        .reviewAdvertEyebrow,
        .reviewAdvertFeatureLabel {
          display: block;
          color: #124fad;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: .11em;
          text-transform: uppercase;
        }

        .reviewAdvertHero h2 {
          max-width: 620px;
          margin: 10px 0 13px;
          font-size: clamp(27px, 3vw, 38px);
          line-height: 1.08;
          letter-spacing: -.035em;
        }

        .reviewAdvertHeroCopy > p {
          max-width: 590px;
          margin: 0;
          color: #656c67;
          font-size: 14px;
          line-height: 1.65;
        }

        .reviewAdvertActions {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-top: 24px;
        }

        .reviewAdvertPrimary,
        a.reviewAdvertPrimary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 17px;
          border: 1px solid #124fad;
          border-radius: 8px;
          background: #124fad;
          color: #fff !important;
          font-size: 13px;
          font-weight: 750;
          text-decoration: none !important;
        }

        .reviewAdvertPrimary:hover,
        a.reviewAdvertPrimary:hover {
          border-color: #0e4395;
          background: #0e4395;
          color: #fff !important;
        }

        .reviewAdvertLogin {
          color: #313733;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
        }

        .reviewAdvertLogin:hover {
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .reviewAdvertPreview {
          overflow: hidden;
          border: 1px solid #d7dad6;
          border-radius: 12px;
          background: #fff;
          box-shadow: 0 16px 38px rgba(26,35,29,.07);
        }

        .reviewPreviewTop {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 15px 17px;
          border-bottom: 1px solid #e3e5e2;
        }

        .reviewPreviewTop span {
          color: #124fad;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: .11em;
        }

        .reviewPreviewTop strong {
          color: #68706a;
          font-size: 10px;
        }

        .reviewPreviewQuestion {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          padding: 17px;
          border-bottom: 1px solid #eceeeb;
        }

        .reviewPreviewQuestion strong,
        .reviewPreviewQuestion span {
          display: block;
        }

        .reviewPreviewQuestion strong {
          color: #171b18;
          font-size: 12px;
        }

        .reviewPreviewQuestion div > span {
          margin-top: 4px;
          color: #858b87;
          font-size: 10px;
        }

        .reviewPreviewFlagged {
          display: block;
          margin-top: 7px;
          color: #124fad;
          font-size: 10px;
          font-weight: 800;
          line-height: 1.35;
        }

        .reviewPreviewArrow {
          color: #717873;
          font-size: 15px;
        }

        .reviewPreviewAction {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 14px 17px;
          background: #fff0b8;
          color: #554613;
          font-size: 11px;
          font-weight: 750;
        }

        .reviewAdvertFeatures {
          display: grid;
          grid-template-columns: repeat(3,minmax(0,1fr));
          gap: 14px;
        }

        .reviewAdvertFeature {
          min-height: 220px;
          padding: 25px;
          border: 1px solid rgba(22,33,26,.1);
          border-radius: 14px;
          background: rgba(255,255,255,.8);
        }

        .reviewAdvertNumber {
          display: block;
          margin-bottom: 28px;
          color: #a4aaa6;
          font-size: 11px;
          font-weight: 800;
        }

        .reviewAdvertFeature h3 {
          margin: 8px 0 9px;
          color: #111412;
          font-size: 18px;
          line-height: 1.2;
          letter-spacing: -.02em;
        }

        .reviewAdvertFeature p {
          margin: 0;
          color: #6c736e;
          font-size: 12px;
          line-height: 1.6;
        }


        .reviewAdvertSecondary,
        a.reviewAdvertSecondary {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 42px;
          padding: 0 17px;
          border: 1px solid #cfd4d0;
          border-radius: 8px;
          background: #fff;
          color: #252a26 !important;
          font-size: 13px;
          font-weight: 750;
          text-decoration: none !important;
        }

        .reviewAdvertSecondary:hover,
        a.reviewAdvertSecondary:hover {
          border-color: #aab1ab;
          background: #f7f8f7;
        }

        .reviewSimilarDemo {
          display: grid;
          grid-template-columns: minmax(220px,.62fr) minmax(0,1.38fr);
          gap: 46px;
          align-items: center;
          padding: 38px 40px;
          border: 1px solid rgba(22,33,26,.1);
          border-radius: 14px;
          background: #f8f8f5;
        }

        .reviewSimilarIntro h2 {
          max-width: 320px;
          margin: 9px 0 10px;
          font-size: 29px;
          line-height: 1.06;
          letter-spacing: -.035em;
        }

        .reviewSimilarIntro > p {
          max-width: 340px;
          margin: 0;
          color: #69706b;
          font-size: 12px;
          line-height: 1.6;
        }

        .reviewSimilarPromise {
          display: grid;
          gap: 2px;
          margin-top: 19px;
          font-size: 11px;
          line-height: 1.4;
        }

        .reviewSimilarPromise strong {
          color: #124fad;
        }

        .reviewSimilarPromise span {
          color: #747b76;
        }

        .reviewSimilarVisual {
          display: grid;
          grid-template-columns: minmax(0,1fr) auto minmax(0,1fr);
          align-items: center;
          gap: 12px;
          min-width: 0;
        }

        .reviewSimilarQuestion {
          overflow: hidden;
          min-width: 0;
          border: 1px solid #d9ddd9;
          border-radius: 11px;
          background: #fff;
        }

        .reviewSimilarQuestion.fresh {
          border-color: #bfcac1;
          box-shadow: 0 10px 28px rgba(26,35,29,.055);
        }

        .reviewSimilarQuestionHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 11px 13px;
          border-bottom: 1px solid #eceeeb;
        }

        .reviewSimilarQuestionHead span {
          color: #124fad;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .09em;
        }

        .reviewSimilarQuestionHead strong {
          color: #777e79;
          font-size: 9px;
          font-weight: 700;
        }

        .reviewSimilarMath {
          display: grid;
          gap: 8px;
          padding: 23px 16px 25px;
        }

        .reviewSimilarMath small {
          color: #777e79;
          font-size: 10px;
        }

        .reviewSimilarMath strong {
          color: #161a17;
          font-family: Georgia, "Times New Roman", serif;
          font-size: 18px;
          font-weight: 500;
          line-height: 1.35;
          white-space: nowrap;
        }

        .reviewSimilarConnector {
          display: grid;
          justify-items: center;
          gap: 6px;
        }

        .reviewSimilarArrow {
          color: #9aa19c;
          font-size: 15px;
        }

        .reviewSimilarPill {
          padding: 9px 10px;
          border: 1px solid #e3c557;
          border-radius: 7px;
          background: #fff0b8;
          color: #51420f;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: .045em;
          white-space: nowrap;
        }

        .reviewSimilarNext {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 13px;
          border-top: 1px solid #eceeeb;
          background: #fff0b8;
          color: #51420f;
          font-size: 9px;
          font-weight: 800;
        }

        .reviewAdvertClosing {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 36px;
          padding: 30px 32px;
          border: 1px solid #d8dbd7;
          border-radius: 14px;
          background: #f4f6f4;
        }

        .reviewAdvertClosing h2 {
          margin: 8px 0 6px;
          font-size: 22px;
          letter-spacing: -.025em;
        }

        .reviewAdvertClosing p {
          max-width: 650px;
          margin: 0;
          color: #68706a;
          font-size: 12px;
          line-height: 1.55;
        }

        .reviewAdvertClosing .reviewAdvertActions {
          flex: 0 0 auto;
          margin-top: 0;
        }



        /* Review advert: miniature DOJO / exam-style questions */
        .reviewSimilarDemo {
          grid-template-columns: minmax(205px,.48fr) minmax(0,1.52fr);
          gap: 34px;
        }

        .reviewSimilarVisual {
          grid-template-columns: minmax(275px,1fr) auto minmax(275px,1fr);
          gap: 14px;
        }

        .reviewSimilarQuestion {
          min-height: 238px;
        }

        .reviewSimilarQuestionHead {
          padding: 11px 14px;
        }

        .reviewSimilarExamQuestion {
          display: grid;
          grid-template-columns: 24px minmax(0,1fr) 30px;
          gap: 8px;
          min-height: 174px;
          padding: 22px 14px 18px;
          background: #fff;
          color: #111;
        }

        .reviewSimilarExamNumber {
          padding-top: 1px;
          font-size: 13px;
          font-weight: 700;
        }

        .reviewSimilarExamBody {
          min-width: 0;
          font-size: 12px;
          line-height: 1.65;
        }

        .reviewSimilarExamBody p {
          margin: 0 0 10px;
        }

        .reviewSimilarExamBody p:last-child {
          margin-bottom: 0;
        }

        .reviewSimilarDisplayMath {
          margin: 5px 0 12px;
          overflow: visible;
          font-size: 15px;
        }

        .reviewSimilarDisplayMath .katex-display {
          margin: .45em 0;
          text-align: left;
        }

        .reviewSimilarDisplayMath .katex-display > .katex {
          text-align: left;
        }

        .reviewSimilarExamBody .katex {
          font-size: 1.08em;
        }

        .reviewSimilarExamMarks {
          align-self: end;
          justify-self: end;
          padding-bottom: 1px;
          font-size: 11px;
        }

        .reviewSimilarMath p {
          margin: 0;
          color: #555d57;
          font-size: 10px;
          line-height: 1.5;
        }

        .reviewAdvertActions > a.reviewAdvertPrimary {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-height: 42px;
          padding: 0 17px !important;
          border: 1px solid #124fad !important;
          border-radius: 8px !important;
          background: #124fad !important;
          color: #fff !important;
          font-size: 13px;
          font-weight: 750;
          line-height: 1;
          text-decoration: none !important;
        }

        .reviewAdvertActions > a.reviewAdvertSecondary {
          display: inline-flex !important;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          min-height: 42px;
          padding: 0 17px !important;
          border: 1px solid #cfd4d0 !important;
          border-radius: 8px !important;
          background: #fff !important;
          color: #252a26 !important;
          font-size: 13px;
          font-weight: 750;
          line-height: 1;
          text-decoration: none !important;
        }

        .reviewAdvertActions > a.reviewAdvertPrimary:hover {
          border-color: #0e4395 !important;
          background: #0e4395 !important;
        }

        .reviewAdvertActions > a.reviewAdvertSecondary:hover {
          border-color: #aab1ab !important;
          background: #f6f7f6 !important;
        }

        @media (max-width: 750px) {
          .reviewSimilarDemo {
            grid-template-columns: 1fr;
            gap: 26px;
            padding: 26px 22px;
          }

          .reviewSimilarVisual {
            grid-template-columns: 1fr;
          }

          .reviewSimilarQuestion {
            min-height: 0;
          }

          .reviewSimilarExamQuestion {
            min-height: 190px;
          }

          .reviewSimilarConnector {
            grid-template-columns: 1fr auto 1fr;
            align-items: center;
          }

          .reviewSimilarArrow:first-child {
            transform: rotate(90deg);
          }

          .reviewSimilarArrow:last-child {
            transform: rotate(90deg);
          }


          .reviewAdvertHero {
            grid-template-columns: 1fr;
            gap: 30px;
            padding: 26px 22px;
          }

          .reviewAdvertFeatures {
            grid-template-columns: 1fr;
          }

          .reviewAdvertFeature {
            min-height: 0;
          }

          .reviewAdvertNumber {
            margin-bottom: 18px;
          }

          .reviewAdvertClosing {
            align-items: flex-start;
            flex-direction: column;
            padding: 25px 22px;
          }

          .reviewAdvertClosing .reviewAdvertActions {
            margin-top: 2px;
          }

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

          :global(.reviewWorkRow) {
            grid-template-columns:
              minmax(0,1fr)
              auto;
            gap:12px;
          }

          :global(.reviewWorkStatus) {
            min-width:0;
            text-align:right;
          }

          :global(.reviewWorkArrow) {
            display:none;
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

        /* Review colour and information hierarchy */
        .reviewWorkSection :global(.workCount) {
          background:#f3f7f4;
          border-color:#cfddd3;
        }

        .reviewAllClearCompact {
          display:inline-flex;
          width:auto;
          min-height:0;
          margin:0 0 10px;
          padding:7px 11px;
          border:1px solid #c9ddcf;
          border-radius:999px;
          background:#edf6ef;
        }

        .reviewAllClearCompact strong {
          color:#28563a;
          font-size:10px;
          font-weight:800;
          line-height:1;
        }

        .reviewWorkSection :global(.reviewPriorityGroup) {
          border-color:#e8c966;
          background:#fffaf0;
        }

        .reviewWorkSection :global(.reviewPriorityGroup .reviewGroupHeading strong) {
          color:#6c5000;
        }

        .reviewWorkSection :global(.reviewGroupCount) {
          border:1px solid #ecd47f;
          background:#fff0b8;
          color:#684d00;
          font-weight:800;
        }

        .reviewWorkSection :global(.reviewPriorityGroup .reviewWorkRow) {
          border-color:#eadcae;
          background:#fff;
        }

        :global(.reviewResultBadge) {
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:25px;
          padding:5px 9px;
          border:1px solid transparent;
          border-radius:7px;
          font-size:10px;
          font-weight:800;
          line-height:1;
          white-space:nowrap;
        }

        :global(.reviewResultScore) {
          border-color:#d4d8d5;
          background:#f5f6f5;
          color:#17231b;
        }

        :global(.reviewResultProgress) {
          border-color:#bfd1e5;
          background:#edf4fb;
          color:#254f78;
        }

        :global(.reviewResultMarking) {
          border-color:#d9c8eb;
          background:#f4eef9;
          color:#5d3977;
        }

        :global(.reviewResultReady) {
          border-color:#e4d5a2;
          background:#fff7d9;
          color:#66500b;
        }

        :global(.reviewWorkFlagged) {
          display:inline-flex;
          align-items:center;
          width:max-content;
          margin-top:5px;
          padding:4px 7px;
          border:1px solid #ecd47f;
          border-radius:999px;
          background:#fff1bd;
          color:#6b5000 !important;
          font-size:9px;
          font-weight:800;
          line-height:1;
        }

        .reviewWorkSection :global(.reviewHistoryTabs) {
          background:#f6f8f7;
        }

        .reviewWorkSection :global(.reviewHistoryTab) {
          border:1px solid transparent;
          border-radius:8px;
          color:#59665e;
        }

        .reviewWorkSection :global(.reviewHistoryTab.active) {
          border-color:#b9cde2;
          background:#edf4fb;
          color:#214f7b;
          box-shadow:none;
        }

        .reviewWorkSection :global(.reviewHistoryTab.active strong) {
          background:#dcebf7;
          color:#214f7b;
        }

        .reviewWorkSection :global(.reviewWorkRow) {
          transition:
            border-color .15s ease,
            background .15s ease;
        }

        .reviewWorkSection :global(.reviewWorkRow:hover) {
          border-color:#c4d2c8;
          background:#fbfcfb;
        }


      `}</style>
    </main>
  );
}
