'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import PracticeSession from './PracticeSession';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:8000';

type Props = {
  workId: string;
};

type SavedQuestion = {
  position: number;
  question_id: string;
  marks_awarded: number | null;
  marks_available: number | null;
  marked_at: string | null;
};

const textOf = (block:any) =>
  String(
    block?.content ??
    block?.text ??
    block?.latex ??
    ''
  );

function MathText({text}:{text:string}) {
  const bits = text
    .split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g)
    .filter(Boolean);

  return (
    <>
      {bits.map((bit,index) => {
        if(
          bit.startsWith('$$') &&
          bit.endsWith('$$')
        ) {
          return (
            <BlockMath
              key={index}
              math={bit.slice(2,-2)}
            />
          );
        }

        if(
          bit.startsWith('$') &&
          bit.endsWith('$')
        ) {
          return (
            <InlineMath
              key={index}
              math={bit.slice(1,-1)}
            />
          );
        }

        return (
          <span
            key={index}
            style={{whiteSpace:'pre-wrap'}}
          >
            {bit}
          </span>
        );
      })}
    </>
  );
}

function Blocks({blocks}:{blocks:any[]}) {
  if(!Array.isArray(blocks)) return null;

  return (
    <>
      {blocks.map((block,index) => {
        const type = block?.type || 'markdown';
        const text = textOf(block);

        if(type === 'spacer') {
          return (
            <div
              className="qSpacer"
              key={index}
            />
          );
        }

        if(type === 'latex') {
          return (
            <div
              className="displayMath"
              key={index}
            >
              <BlockMath math={text}/>
            </div>
          );
        }

        if(type === 'caption') {
          return (
            <div
              className="renderCaption"
              key={index}
            >
              <MathText text={text}/>
            </div>
          );
        }

        return (
          <div
            className="renderText"
            key={index}
          >
            <MathText text={text}/>
          </div>
        );
      })}
    </>
  );
}

function QuestionDisplay({q}:{q:any}) {
  const blocks =
    q?.question?.display_blocks ||
    q?.display?.question_blocks ||
    [];

  if(blocks.length) {
    return <Blocks blocks={blocks}/>;
  }

  return (
    <MathText
      text={String(q?.question?.text || '')}
    />
  );
}

function AnswerView({q}:{q:any}) {
  const map = q?.display?.answer_blocks;

  if(map && typeof map === 'object') {
    const entries = Object.entries(map);

    if(entries.length) {
      return (
        <div className="reviewContent">
          {entries.map(([key,value]:any) => (
            <section
              className="reviewPart"
              key={key}
            >
              {entries.length > 1 && (
                <h3>
                  {key === '__whole_question__'
                    ? 'Answer'
                    : `Part ${String(key)
                        .replace(/[()]/g,'')
                        .toUpperCase()}`}
                </h3>
              )}

              <Blocks blocks={value}/>
            </section>
          ))}
        </div>
      );
    }
  }

  if(typeof q?.answer === 'string') {
    return (
      <div className="reviewContent">
        <MathText text={q.answer}/>
      </div>
    );
  }

  return (
    <div className="reviewContent">
      <pre className="answerFallback">
        {JSON.stringify(q?.answer ?? {},null,2)}
      </pre>
    </div>
  );
}

function FullSolutionView({q}:{q:any}) {
  const parts = Array.isArray(q?.solution?.parts)
    ? q.solution.parts
    : [];

  const groups = parts.length
    ? parts
    : [{steps:q?.solution?.steps || []}];

  return (
    <div className="reviewContent">
      {groups.map((part:any,partIndex:number) => (
        <section
          className="reviewPart fullWorked"
          key={partIndex}
        >
          {groups.length > 1 && (
            <h3>
              Part{' '}
              {String(
                part?.part ??
                part?.label ??
                String.fromCharCode(97 + partIndex)
              )
                .replace(/[()]/g,'')
                .toUpperCase()}
            </h3>
          )}

          {(part.steps || []).map(
            (step:any,stepIndex:number) => {
              const blocks =
                step?.display?.working_blocks ||
                step?.working_blocks ||
                [];

              return (
                <div
                  className="workedStep"
                  key={stepIndex}
                >
                  {step?.description && (
                    <b>{step.description}</b>
                  )}

                  <Blocks blocks={blocks}/>
                </div>
              );
            }
          )}
        </section>
      ))}
    </div>
  );
}

function MarkSchemeView({q}:{q:any}) {
  const parts = Array.isArray(q?.solution?.parts)
    ? q.solution.parts
    : [];

  const groups = parts.length
    ? parts
    : [{steps:q?.solution?.steps || []}];

  return (
    <div className="reviewContent">
      {groups.map((part:any,partIndex:number) => (
        <section
          className="reviewPart"
          key={partIndex}
        >
          {groups.length > 1 && (
            <h3>
              Part{' '}
              {String(
                part?.part ??
                part?.label ??
                String.fromCharCode(97 + partIndex)
              )
                .replace(/[()]/g,'')
                .toUpperCase()}
            </h3>
          )}

          {(part.steps || []).map(
            (step:any,stepIndex:number) => {
              const blocks =
                step?.display?.working_blocks ||
                step?.working_blocks ||
                [];

              return (
                <div
                  className="workedStep"
                  key={stepIndex}
                >
                  <div>
                    <b>
                      {stepIndex + 1}.{' '}
                      {step?.description ||
                        `Step ${stepIndex + 1}`}
                    </b>
                  </div>

                  <Blocks blocks={blocks}/>

                  {step?.display
                    ?.fallback_mark_caption && (
                    <div className="renderCaption">
                      {
                        step.display
                          .fallback_mark_caption
                      }
                    </div>
                  )}
                </div>
              );
            }
          )}
        </section>
      ))}
    </div>
  );
}
function practiseSimilarHref(q:any) {
  const primary =
    q?.topic_metadata?.primary ||
    q?.areas?.[0] ||
    q?.topic ||
    '';

  const slug = String(primary)
    .toLowerCase()
    .trim()
    .replace(/&/g,'and')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-|-$/g,'');

  return `/topics/pure/${slug}`;
}

function ReviewWork({
  work,
  questions,
  refs
}:{
  work:any;
  questions:any[];
  refs:SavedQuestion[];
}) {
  const [index,setIndex] = useState(0);
  const [shown,setShown] = useState<
    'answer' | 'markscheme' | 'solution' | null
  >(null);

  const q = questions[index];
  const ref = refs[index];
const similarHref = practiseSimilarHref(q);

const questionArea =
  q?.topic_metadata?.primary ||
  q?.areas?.[0] ||
  q?.topic ||
  'this topic';

const questionFamily =
  q?.family ||
  q?.generative_structure?.family ||
  null;

  const awarded = refs.reduce(
    (total,item) =>
      total + (item.marks_awarded ?? 0),
    0
  );

  const available = refs.reduce(
    (total,item) =>
      total + (item.marks_available ?? 0),
    0
  );

  function move(next:number) {
    setIndex(next);
    setShown(null);
  }

  return (
    <section className="practiceSession">
      <header className="sessionHeader">
        <div>
          <div className="sessionEyebrow">
            Completed question set
          </div>

          <h1>{work.title}</h1>
        </div>

        <div className="sessionHeaderRight">
          <div className="sessionProgress">
            <span>
              {awarded} / {available} marks
            </span>

            <div>
              <i
                style={{
                  width:
                    available > 0
                      ? `${Math.round(
                          (awarded / available) * 100
                        )}%`
                      : '0%'
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div
        style={{
          display:'grid',
          gridTemplateColumns:'minmax(0,1fr) 230px',
          gap:'24px',
          alignItems:'start'
        }}
      >
        <div className="questionColumn">
          <div className="questionPaper edexcelPaper">
            <div className="paperQuestionNumber">
              {index + 1}.
            </div>

            <div className="questionBody">
              <QuestionDisplay q={q}/>
            </div>

            <div className="paperMarks">
              ({ref?.marks_available ?? q?.marks ?? 0})
            </div>
          </div>

        <div
  style={{
    marginTop:'14px',
    padding:'16px 20px',
    border:'1px solid #d9d9d9',
    background:'#fff',
    display:'flex',
    justifyContent:'space-between',
    alignItems:'center',
    gap:'20px'
  }}
>
  <div>
    <div
      style={{
        fontSize:'11px',
        color:'#777',
        marginBottom:'4px'
      }}
    >
      YOUR MARK
    </div>

    <strong style={{fontSize:'20px'}}>
      {ref?.marks_awarded ?? 0}
      {' / '}
      {ref?.marks_available ?? q?.marks ?? 0}
    </strong>

    <div
      style={{
        marginTop:'7px',
        fontSize:'12px',
        color:'#777'
      }}
    >
      {questionArea}
    </div>
  </div>

  <div
    style={{
      display:'flex',
      alignItems:'center',
      gap:'16px'
    }}
  >
    <span
      style={{
        fontSize:'13px',
        color:'#666'
      }}
    >
      Question {index + 1} of {questions.length}
    </span>

    <Link
      href={similarHref}
      style={{
        display:'inline-flex',
        alignItems:'center',
        justifyContent:'center',
        minHeight:'38px',
        padding:'0 16px',
        border:'1px solid #111',
        borderRadius:'6px',
        background:'#111',
        color:'#fff',
        textDecoration:'none',
        fontSize:'13px',
        fontWeight:700
      }}
    >
      Practise similar →
    </Link>
  </div>
</div>

          <section className="solutionTools">
            <div className="solutionChoices">
              <span>Review</span>

              <div>
                <button
                  className={
                    shown === 'answer'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setShown(
                      shown === 'answer'
                        ? null
                        : 'answer'
                    )
                  }
                >
                  Answer
                </button>

                <button
                  className={
                    shown === 'markscheme'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setShown(
                      shown === 'markscheme'
                        ? null
                        : 'markscheme'
                    )
                  }
                >
                  Mark scheme
                </button>

                <button
                  className={
                    shown === 'solution'
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setShown(
                      shown === 'solution'
                        ? null
                        : 'solution'
                    )
                  }
                >
                  Full solution
                </button>
              </div>
            </div>

            {shown && (
              <div className="solutionReveal">
                {shown === 'answer' && (
                  <AnswerView q={q}/>
                )}

                {shown === 'markscheme' && (
                  <MarkSchemeView q={q}/>
                )}

                {shown === 'solution' && (
                  <FullSolutionView q={q}/>
                )}
              </div>
            )}
          </section>
        </div>

        <aside
          style={{
            border:'1px solid #ddd',
            background:'#fff',
            padding:'16px'
          }}
        >
          <div
            style={{
              fontSize:'11px',
              color:'#777',
              marginBottom:'12px'
            }}
          >
            QUESTIONS
          </div>

          <div
            style={{
              display:'grid',
              gap:'6px'
            }}
          >
            {refs.map((item,i) => (
              <button
                type="button"
                key={item.question_id}
                onClick={() => move(i)}
                style={{
                  display:'flex',
                  justifyContent:'space-between',
                  alignItems:'center',
                  padding:'10px 12px',
                  border:
                    i === index
                      ? '1px solid #222'
                      : '1px solid #ddd',
                  background:
                    i === index
                      ? '#f5f5f5'
                      : '#fff',
                  cursor:'pointer',
                  font:'inherit'
                }}
              >
                <span>Question {i + 1}</span>

                <strong>
                  {item.marks_awarded ?? 0}/
                  {item.marks_available ?? 0}
                </strong>
              </button>
            ))}
          </div>
        </aside>
      </div>

      <footer className="sessionNav">
        <button
          className="secondarySessionButton"
          disabled={index === 0}
          onClick={() =>
            move(Math.max(0,index - 1))
          }
        >
          ← Previous
        </button>

        <div className="questionDots">
          {refs.map((item,i) => (
            <button
              key={item.question_id}
              aria-label={`Question ${i + 1}`}
              className={
                i === index
                  ? 'active marked'
                  : 'marked'
              }
              onClick={() => move(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {index < questions.length - 1 ? (
          <button
            className="primarySessionButton"
            onClick={() => move(index + 1)}
          >
            Next →
          </button>
        ) : (
          <Link
            className="primarySessionButton"
            href="/my-work"
          >
            Back to My Work
          </Link>
        )}
      </footer>
    </section>
  );
}

export default function ResumeWork({
  workId
}:Props) {
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [work,setWork] = useState<any>(null);
  const [questions,setQuestions] = useState<any[]>([]);
  const [refs,setRefs] = useState<SavedQuestion[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const {
          data:auth,
          error:authError
        } = await supabase.auth.getUser();

        if(authError || !auth.user) {
          throw new Error(
            'You must be logged in to resume this work.'
          );
        }

        const {
          data,
          error:workError
        } = await supabase
          .from('work_items')
          .select(`
            id,
            title,
            kind,
            status,
            settings,
            created_at,
            completed_at,
            marked_at,
            work_questions (
              position,
              question_id,
              marks_awarded,
              marks_available,
              marked_at
            )
          `)
          .eq('id',workId)
          .single();

        if(workError || !data) {
          throw (
            workError ??
            new Error('Saved work not found.')
          );
        }

        const savedRefs = [
          ...(data.work_questions || [])
        ].sort(
          (a:any,b:any) =>
            a.position - b.position
        ) as SavedQuestion[];

        if(!savedRefs.length) {
          throw new Error(
            'This work item has no saved questions.'
          );
        }

        const loaded = await Promise.all(
          savedRefs.map(async ref => {
            const response = await fetch(
              `${API}/questions/${encodeURIComponent(
                ref.question_id
              )}`,
              {
                cache:'no-store'
              }
            );

            if(!response.ok) {
              throw new Error(
                `Could not load question ${ref.question_id}.`
              );
            }

const payload = await response.json();

const question =
  payload?.id || payload?.question_id
    ? payload
    : payload?.question ?? payload;

return {
  ...question,
  id:
    question?.id ??
    question?.question_id ??
    ref.question_id,
  question_id:
    question?.question_id ??
    ref.question_id
};
          })
        );

        if(cancelled) return;

        setWork(data);
        setRefs(savedRefs);
        setQuestions(
          loaded.filter(Boolean)
        );
      } catch(err:any) {
        if(cancelled) return;

        console.error(
          'Could not resume DOJO work:',
          err
        );

        setError(
          err?.message ||
          'Could not load this saved work.'
        );
      } finally {
        if(!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  },[workId]);

  const currentQuestion = useMemo(
    () =>
      Number(
        work?.settings?.currentQuestion
      ) || 0,
    [work]
  );

  if(loading) {
    return (
      <main className="main practiceShell">
        <div className="placeholder">
          <b>Loading your saved work...</b>
        </div>
      </main>
    );
  }

  if(
    error ||
    !work ||
    !questions.length
  ) {
    return (
      <main className="main practiceShell">
        <div className="placeholder">
          <b>
            Could not load this saved work.
          </b>

          <p>
            {error ||
              'Return to My Work and try again.'}
          </p>

          <Link href="/my-work">
            Return to My Work
          </Link>
        </div>
      </main>
    );
  }

  const mode =
    work.settings?.mode === 'exam'
      ? 'exam'
      : 'practice';

  const isMarked =
    work.status === 'marked';

  return (
    <main className="main practiceShell">
      <div className="crumb">
        <Link href="/my-work">
          My Work
        </Link>

        <span>›</span>

        {work.title}
      </div>

      {isMarked ? (
        <ReviewWork
          work={work}
          questions={questions}
          refs={refs}
        />
      ) : (
        <PracticeSession
          persistWork={false}
          existingWorkId={work.id}
          initialQuestion={currentQuestion}
          topic={work.title}
          mode={mode}
          questions={questions}
          options={{
            askDojo:mode === 'practice',
            solutions:mode === 'practice',
            timer:false,
            freeNav:true
          }}
        />
      )}
    </main>
  );
}