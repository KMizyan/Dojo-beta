'use client';

import CoverageSnapshot from './CoverageSnapshot';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Tab = 'recent' | 'exams' | 'practice';
type Area = 'All' | 'Pure' | 'Statistics' | 'Mechanics';

type WorkItem = {
  id: string;
  title: string;
  kind: string;
  status: 'in_progress' | 'completed' | 'marking' | 'marked';
  created_at: string;
  work_questions?: { question_id: string }[];
};

const exams = [
  { title: 'DOJO A-level Pure', area: 'Pure', date: '21 Sep', score: 68, total: 80, source: 'DOJO generated' },
  { title: 'Edexcel 2022 Paper 1', area: 'Pure', date: '18 Sep', score: 61, total: 100, source: 'Past paper' },
  { title: 'Edexcel 2021 Paper 2', area: 'Pure', date: '12 Sep', score: 72, total: 100, source: 'Past paper' },
];

const practice = [
  { topic: 'Integration', area: 'Pure', last: 'Yesterday', sessions: 8, wrong: 7 },
  { topic: 'Trigonometry', area: 'Pure', last: '17 Sep', sessions: 5, wrong: 4 },
  { topic: 'Differentiation', area: 'Pure', last: '14 Sep', sessions: 4, wrong: 2 },
];

function statusLabel(status: WorkItem['status']) {
  if (status === 'completed') return 'Completed — waiting to be marked';
  if (status === 'marking') return 'Marking';
  if (status === 'marked') return 'Marked';
  return 'In progress';
}

function actionLabel(status: WorkItem['status']) {
  if (status === 'completed') return 'Mark';
  if (status === 'marked') return 'Review';
  return 'Continue';
}

function dateLabel(value: string) {
  const date = new Date(value);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) return 'Today';

  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export default function MyWorkPage() {
  const [tab, setTab] = useState<Tab>('recent');
  const [area, setArea] = useState<Area>('All');
  const [recent, setRecent] = useState<WorkItem[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    async function loadRecent() {
      const { data: auth } = await supabase.auth.getUser();

      if (!auth.user) {
        setRecent([]);
        setLoadingRecent(false);
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
          work_questions (
            question_id
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Could not load My Work:', error);
        setRecent([]);
      } else {
        setRecent((data ?? []) as WorkItem[]);
      }

      setLoadingRecent(false);
    }

    loadRecent();
  }, []);

  const filteredExams = useMemo(
    () => exams.filter(x => area === 'All' || x.area === area),
    [area]
  );

  return (
    <main className="work-page">
      <CoverageSnapshot />

      <div className="page-kicker">A-level Mathematics</div>
      <h1>My Work</h1>
      <p className="page-intro">
        Your work, results and anything you need to come back to.
      </p>

      <nav className="work-tabs" aria-label="My Work sections">
        <button
          className={tab === 'recent' ? 'active' : ''}
          onClick={() => setTab('recent')}
        >
          Recent
        </button>

        <button
          className={tab === 'exams' ? 'active' : ''}
          onClick={() => setTab('exams')}
        >
          Exams
        </button>

        <button
          className={tab === 'practice' ? 'active' : ''}
          onClick={() => setTab('practice')}
        >
          Practice
        </button>
      </nav>

      {tab === 'recent' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Recent</h2>
              <p>
                Pick up where you left off or return to something you've finished.
              </p>
            </div>
          </div>

          <div className="work-list">
            {loadingRecent && (
              <p className="empty-history">Loading your work...</p>
            )}

            {!loadingRecent && recent.length === 0 && (
              <p className="empty-history">
                You haven't started any work yet.
              </p>
            )}

            {!loadingRecent && recent.map(item => {
              const questionCount = item.work_questions?.length ?? 0;
              const isExam = item.kind === 'exam';

              return (
                <article className="work-row" key={item.id}>
                  <div
                    className={`work-type-dot ${isExam ? 'exam' : 'practice'}`}
                  />

                  <div className="work-main">
                    <strong>{item.title}</strong>
                    <span>
                      {isExam ? 'Exam' : 'Practice'}
                      {questionCount > 0
                        ? ` · ${questionCount} questions`
                        : ''}
                    </span>
                  </div>

                  <div className="work-status">
                    <strong>{statusLabel(item.status)}</strong>
                    <span>{dateLabel(item.created_at)}</span>
                  </div>

                  <Link href={`/practice?work=${encodeURIComponent(item.id)}`}>
                    {actionLabel(item.status)}
                  </Link>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'exams' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Exams</h2>
              <p>
                Exam-condition papers are kept separately so you can track
                assessment results over time.
              </p>
            </div>

            <Link href="/papers">Sit another paper →</Link>
          </div>

          <div className="work-filter-row">
            {(['All', 'Pure', 'Statistics', 'Mechanics'] as Area[]).map(x => (
              <button
                key={x}
                className={area === x ? 'active' : ''}
                onClick={() => setArea(x)}
              >
                {x}
              </button>
            ))}
          </div>

          <div className="exam-summary">
            <div>
              <span className="summary-label">Completed exams</span>
              <strong>{filteredExams.length}</strong>
            </div>

            <div>
              <span className="summary-label">Latest result</span>
              <strong>
                {filteredExams.length
                  ? `${filteredExams[0].score}/${filteredExams[0].total}`
                  : '—'}
              </strong>
            </div>
          </div>

          <div className="score-history">
            <h3>Results over time</h3>

            {filteredExams.length ? (
              <div className="score-bars">
                {[...filteredExams].reverse().map((x, i) => {
                  const pct = Math.round((x.score / x.total) * 100);

                  return (
                    <div className="score-column" key={i}>
                      <div className="score-number">{pct}%</div>

                      <div className="score-track">
                        <div style={{ height: `${pct}%` }} />
                      </div>

                      <div className="score-date">{x.date}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-history">
                No exam results in this area yet.
              </p>
            )}
          </div>

          <div className="work-list exam-list">
            {filteredExams.map((x, i) => (
              <article className="work-row" key={i}>
                <div className="work-main">
                  <strong>{x.title}</strong>
                  <span>{x.source} · {x.area}</span>
                </div>

                <div className="exam-score">
                  {x.score}/{x.total}
                </div>

                <div className="work-status">
                  <span>{x.date}</span>
                </div>

                <button>View</button>
              </article>
            ))}
          </div>

          <p className="quiet-note">
            Generated papers and official past papers remain identifiable rather
            than being treated as automatically equivalent assessments.
          </p>
        </section>
      )}

      {tab === 'practice' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Practice</h2>
              <p>
                A record of what you've worked on, without turning everyday
                practice into a grade.
              </p>
            </div>

            <Link href="/topics">Go to Topics →</Link>
          </div>

          <div className="work-filter-row">
            {(['All', 'Pure', 'Statistics', 'Mechanics'] as Area[]).map(x => (
              <button
                key={x}
                className={area === x ? 'active' : ''}
                onClick={() => setArea(x)}
              >
                {x}
              </button>
            ))}
          </div>

          <div className="practice-grid">
            {practice
              .filter(x => area === 'All' || x.area === area)
              .map((x, i) => (
                <article className="practice-card" key={i}>
                  <div>
                    <span className="practice-area">{x.area}</span>
                    <h3>{x.topic}</h3>
                    <p>
                      Last practised {x.last} · {x.sessions} sessions
                    </p>
                  </div>

                  <div className="practice-wrong">
                    {x.wrong} previously wrong questions
                  </div>

                  <div className="practice-actions">
                    <Link
                      href={`/topics/pure/${x.topic
                        .toLowerCase()
                        .replaceAll(' ', '-')}`}
                    >
                      Practise {x.topic}
                    </Link>

                    <button>View history</button>
                  </div>
                </article>
              ))}
          </div>

          {practice.filter(x => area === 'All' || x.area === area).length === 0 && (
            <p className="empty-history">
              No practice history in this area yet.
            </p>
          )}
        </section>
      )}
    </main>
  );
}