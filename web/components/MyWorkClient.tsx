'use client';
import CoverageSnapshot from "./CoverageSnapshot";

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Tab = 'recent' | 'exams' | 'practice';
type Area = 'All' | 'Pure' | 'Statistics' | 'Mechanics';

const recent = [
  { title: 'A-level Pure Paper', meta: 'Exam · 80 marks', when: 'Yesterday', state: 'Completed — waiting to be marked', action: 'Mark paper', kind: 'exam' },
  { title: 'Integration Practice', meta: 'Practice · 10 questions', when: 'Yesterday', state: '7/10 completed', action: 'Continue', kind: 'practice' },
  { title: 'Edexcel 2022 Paper 1', meta: 'Exam · Pure', when: '18 Sep', state: 'Marked · 61/100', action: 'View results', kind: 'exam' },
  { title: 'Trigonometry Practice', meta: 'Practice', when: '17 Sep', state: 'Completed', action: 'Review', kind: 'practice' },
];

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

export default function MyWorkPage() {
  const [tab, setTab] = useState<Tab>('recent');
  const [area, setArea] = useState<Area>('All');

  const filteredExams = useMemo(
    () => exams.filter(x => area === 'All' || x.area === area),
    [area]
  );

  return (
    <main className="work-page">
      <CoverageSnapshot />
      <div className="page-kicker">A-level Mathematics</div>
      <h1>My Work</h1>
      <p className="page-intro">Your work, results and anything you need to come back to.</p>

      <nav className="work-tabs" aria-label="My Work sections">
        <button className={tab === 'recent' ? 'active' : ''} onClick={() => setTab('recent')}>Recent</button>
        <button className={tab === 'exams' ? 'active' : ''} onClick={() => setTab('exams')}>Exams</button>
        <button className={tab === 'practice' ? 'active' : ''} onClick={() => setTab('practice')}>Practice</button>
      </nav>

      {tab === 'recent' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Recent</h2>
              <p>Pick up where you left off or return to something you've finished.</p>
            </div>
          </div>
          <div className="work-list">
            {recent.map((item, i) => (
              <article className="work-row" key={i}>
                <div className={`work-type-dot ${item.kind}`} />
                <div className="work-main">
                  <strong>{item.title}</strong>
                  <span>{item.meta}</span>
                </div>
                <div className="work-status">
                  <strong>{item.state}</strong>
                  <span>{item.when}</span>
                </div>
                <button>{item.action}</button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === 'exams' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Exams</h2>
              <p>Exam-condition papers are kept separately so you can track assessment results over time.</p>
            </div>
            <Link href="/papers">Sit another paper →</Link>
          </div>

          <div className="work-filter-row">
            {(['All', 'Pure', 'Statistics', 'Mechanics'] as Area[]).map(x => (
              <button key={x} className={area === x ? 'active' : ''} onClick={() => setArea(x)}>{x}</button>
            ))}
          </div>

          <div className="exam-summary">
            <div>
              <span className="summary-label">Completed exams</span>
              <strong>{filteredExams.length}</strong>
            </div>
            <div>
              <span className="summary-label">Latest result</span>
              <strong>{filteredExams.length ? `${filteredExams[0].score}/${filteredExams[0].total}` : '—'}</strong>
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
                      <div className="score-track"><div style={{ height: `${pct}%` }} /></div>
                      <div className="score-date">{x.date}</div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="empty-history">No exam results in this area yet.</p>}
          </div>

          <div className="work-list exam-list">
            {filteredExams.map((x, i) => (
              <article className="work-row" key={i}>
                <div className="work-main">
                  <strong>{x.title}</strong>
                  <span>{x.source} · {x.area}</span>
                </div>
                <div className="exam-score">{x.score}/{x.total}</div>
                <div className="work-status"><span>{x.date}</span></div>
                <button>View</button>
              </article>
            ))}
          </div>
          <p className="quiet-note">Generated papers and official past papers remain identifiable rather than being treated as automatically equivalent assessments.</p>
        </section>
      )}

      {tab === 'practice' && (
        <section className="work-section">
          <div className="work-heading">
            <div>
              <h2>Practice</h2>
              <p>A record of what you've worked on, without turning everyday practice into a grade.</p>
            </div>
            <Link href="/topics">Go to Topics →</Link>
          </div>

          <div className="work-filter-row">
            {(['All', 'Pure', 'Statistics', 'Mechanics'] as Area[]).map(x => (
              <button key={x} className={area === x ? 'active' : ''} onClick={() => setArea(x)}>{x}</button>
            ))}
          </div>

          <div className="practice-grid">
            {practice.filter(x => area === 'All' || x.area === area).map((x, i) => (
              <article className="practice-card" key={i}>
                <div>
                  <span className="practice-area">{x.area}</span>
                  <h3>{x.topic}</h3>
                  <p>Last practised {x.last} · {x.sessions} sessions</p>
                </div>
                <div className="practice-wrong">{x.wrong} previously wrong questions</div>
                <div className="practice-actions">
                  <Link href={`/topics/pure/${x.topic.toLowerCase().replaceAll(' ', '-')}`}>Practise {x.topic}</Link>
                  <button>View history</button>
                </div>
              </article>
            ))}
          </div>

          {practice.filter(x => area === 'All' || x.area === area).length === 0 && (
            <p className="empty-history">No practice history in this area yet.</p>
          )}
        </section>
      )}
    </main>
  );
}


