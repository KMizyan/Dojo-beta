'use client';

import Link from 'next/link';
import { useState } from 'react';

type PaperArea = 'Pure' | 'Statistics' | 'Mechanics';
type Level = 'A-level' | 'AS';

const sampleYears = [2025, 2024, 2023, 2022, 2021, 2020];

export default function PapersPage() {
  const [section, setSection] = useState<'set' | 'past' | 'generate' | null>(null);
  const [level, setLevel] = useState<Level>('A-level');
  const [area, setArea] = useState<PaperArea>('Pure');
  const [marks, setMarks] = useState('Full paper');
  const [examMode, setExamMode] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [askDojo, setAskDojo] = useState(true);
  const [solutions, setSolutions] = useState(true);
  const [timer, setTimer] = useState(false);
  const [freeNav, setFreeNav] = useState(true);
  const [setTopics, setSetTopics] = useState<string[]>([]);
  const [setCount, setSetCount] = useState(10);
  const [setNote, setSetNote] = useState('');
  const topicChoices=['Proof','Algebra & Functions','Coordinate Geometry','Sequences & Series','Trigonometry','Exponentials & Logarithms','Differentiation','Integration','Numerical Methods','Vectors'];

  return (
    <main className="papers-page">
      <div className="page-kicker">A-level Mathematics</div>
      <h1>Practise</h1>
      <p className="page-intro">Build a low-stakes question set, sit a past paper, or generate a fresh exam-style paper.</p>

      {!section && (
        <div className="paper-entry-grid">
          <button className="paper-entry-card question-set-entry" onClick={() => setSection('set')}>
            <span className="paper-entry-title">Question Set</span>
            <span className="paper-entry-copy">Choose the broad things you're working on and get a set of questions to work through.</span>
            <span className="paper-entry-action">Build a set →</span>
          </button>
          <button className="paper-entry-card" onClick={() => setSection('past')}>
            <span className="paper-entry-title">Past Papers</span>
            <span className="paper-entry-copy">Browse real Edexcel exam papers by level, area and year.</span>
            <span className="paper-entry-action">Browse papers →</span>
          </button>
          <button className="paper-entry-card" onClick={() => setSection('generate')}>
            <span className="paper-entry-title">Generate a Paper</span>
            <span className="paper-entry-copy">Create a fresh paper from DOJO questions.</span>
            <span className="paper-entry-action">Create paper →</span>
          </button>
        </div>
      )}


      {section === 'set' && (
        <section className="paper-section questionSetBuilder">
          <button className="text-back" onClick={() => setSection(null)}>← Practise</button>
          <div className="section-heading-row"><div><h2>Build a Question Set</h2><p>Keep it broad. DOJO can use what happens in the set to make the next practice more specific.</p></div></div>

          <div className="builder-block">
            <label>What are you working on?</label>
            <div className="topic-chip-grid">
              {topicChoices.map(t=><button key={t} className={`topic-set-chip ${setTopics.includes(t)?'active':''}`} onClick={()=>setSetTopics(v=>v.includes(t)?v.filter(x=>x!==t):[...v,t])}>{t}</button>)}
            </div>
          </div>

          <div className="question-set-row">
            <div className="builder-block"><label>Questions</label><div className="choice-row compact">{[5,10,15,20].map(n=><button key={n} className={`choice-pill ${setCount===n?'active':''}`} onClick={()=>setSetCount(n)}>{n}</button>)}</div></div>
          </div>

          <div className="specificTestBox">
            <div><strong>Preparing for something specific?</strong><span>Optional — describe what your class or test is covering. Uploading school work can come here once that input is wired.</span></div>
            <textarea value={setNote} onChange={e=>setSetNote(e.target.value)} placeholder="e.g. Differentiation, trig identities and proof by contradiction. No implicit differentiation."/>
            <button disabled>Upload classwork / topic sheet <small>coming later</small></button>
          </div>

          <Link className={`primary-paper-action ${!setTopics.length?'disabled-link':''}`} aria-disabled={!setTopics.length}
            href={setTopics.length?`/practice?topic=${encodeURIComponent(setTopics.join(' + '))}&topics=${encodeURIComponent(setTopics.join(','))}&count=${setCount}&mode=practice&ask=1&solutions=1&freeNav=1&brief=${encodeURIComponent(setNote)}`:'#'}>
            Start {setCount}-question set
          </Link>
        </section>
      )}

      {section === 'past' && (
        <section className="paper-section">
          <button className="text-back" onClick={() => setSection(null)}>← Papers</button>
          <div className="section-heading-row">
            <div>
              <h2>Past Papers</h2>
              <p>Choose the paper you want to access.</p>
            </div>
          </div>

          <div className="choice-row">
            {(['A-level', 'AS'] as Level[]).map(x => (
              <button key={x} className={`choice-pill ${level === x ? 'active' : ''}`} onClick={() => setLevel(x)}>{x}</button>
            ))}
          </div>
          <div className="choice-row secondary">
            {(['Pure', 'Statistics', 'Mechanics'] as PaperArea[]).map(x => (
              <button key={x} className={`choice-pill ${area === x ? 'active' : ''}`} onClick={() => setArea(x)}>{x}</button>
            ))}
          </div>

          <div className="past-paper-list">
            {sampleYears.map(year => (
              <div className="past-paper-row" key={year}>
                <div className="paper-year">{year}</div>
                <div className="paper-name">{level} · {area} · Paper {area === 'Pure' ? '1' : '3'}</div>
                <a
                  className="paper-open"
                  href="https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/mathematics-2017.coursematerials.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Pearson / Edexcel ↗
                </a>
              </div>
            ))}
          </div>
          <p className="quiet-note">For now these links go to Pearson's official course-materials page. DOJO can host or display papers here later if appropriate permissions are in place.</p>
        </section>
      )}

      {section === 'generate' && (
        <section className="paper-section">
          <button className="text-back" onClick={() => setSection(null)}>← Papers</button>
          <h2>Generate a Paper</h2>
          <p>Choose the basics and start. More control is available only if you want it.</p>

          <div className="builder-block">
            <label>Qualification</label>
            <div className="choice-row compact">
              {(['A-level', 'AS'] as Level[]).map(x => (
                <button key={x} className={`choice-pill ${level === x ? 'active' : ''}`} onClick={() => setLevel(x)}>{x}</button>
              ))}
            </div>
          </div>

          <div className="builder-block">
            <label>Content</label>
            <div className="choice-row compact">
              {(['Pure', 'Statistics', 'Mechanics'] as PaperArea[]).map(x => (
                <button key={x} className={`choice-pill ${area === x ? 'active' : ''}`} onClick={() => setArea(x)}>{x}</button>
              ))}
            </div>
          </div>

          <div className="builder-block">
            <label>Paper length</label>
            <div className="choice-row compact">
              {['40 marks', '60 marks', '80 marks', 'Full paper'].map(x => (
                <button key={x} className={`choice-pill ${marks === x ? 'active' : ''}`} onClick={() => setMarks(x)}>{x}</button>
              ))}
            </div>
          </div>

          <div className="exam-mode-row">
            <div>
              <strong>Exam mode</strong>
              <span>Hide solutions and feedback until the paper is finished.</span>
            </div>
            <button
              className={`toggle-button ${examMode ? 'on' : ''}`}
              onClick={() => setExamMode(v => !v)}
              aria-pressed={examMode}
            >
              <span />
            </button>
          </div>

          <button className="advanced-trigger" onClick={() => setAdvanced(v => !v)}>
            Advanced options <span>{advanced ? '−' : '+'}</span>
          </button>

          {advanced && (
            <div className="advanced-panel paper-advanced-panel">
              <div>
                <label>Question selection</label>
                <select defaultValue="mixed">
                  <option value="mixed">Mixed</option>
                  <option value="unseen">Unseen questions</option>
                  <option value="wrong">Previously wrong questions</option>
                </select>
              </div>
              <div>
                <label>Topic weighting</label>
                <select defaultValue="balanced">
                  <option value="balanced">Balanced</option>
                  <option value="custom">Choose topics</option>
                </select>
              </div>

              {!examMode && (
                <div className="paper-workspace-options">
                  <div className="paper-workspace-heading">
                    <strong>Workspace</strong>
                    <span>Choose what is available while you work through the paper.</span>
                  </div>
                  <div className="paper-workspace-grid">
                    {[
                      ['Ask DOJO', 'AI chat alongside the paper', askDojo, setAskDojo],
                      ['Solutions', 'Answer, mark scheme and full solution', solutions, setSolutions],
                      ['Timer', 'Show elapsed working time', timer, setTimer],
                      ['Free navigation', 'Move freely around the paper', freeNav, setFreeNav],
                    ].map(([label, detail, value, setter]: any) => (
                      <label className="paper-workspace-switch" key={label}>
                        <span><strong>{label}</strong><small>{detail}</small></span>
                        <input type="checkbox" checked={value} onChange={e => setter(e.target.checked)} />
                        <i />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {examMode && (
                <div className="paper-exam-note">
                  Exam mode uses the exam workspace: solutions and Ask DOJO stay hidden until the paper is finished.
                </div>
              )}
            </div>
          )}

          <Link className="primary-paper-action" href={`/papers/generated?level=${encodeURIComponent(level)}&area=${encodeURIComponent(area)}&marks=${marks === 'Full paper' ? '100' : marks.split(' ')[0]}&examMode=${examMode ? '1' : '0'}&askDojo=${!examMode && askDojo ? '1' : '0'}&solutions=${!examMode && solutions ? '1' : '0'}&timer=${!examMode && timer ? '1' : '0'}&freeNav=${!examMode && freeNav ? '1' : '0'}`}>
            Generate {level} {area} paper
          </Link>

          <div className="paper-history">
            <div className="history-heading">
              <h3>Your papers</h3>
              <Link href="/my-work">View all in My Work →</Link>
            </div>
            <p className="empty-history">Generated papers and results will appear here as you use DOJO.</p>
          </div>
        </section>
      )}
    </main>
  );
}
