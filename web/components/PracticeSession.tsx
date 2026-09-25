'use client';

import Link from 'next/link';
import {createWorkItem, updateWorkProgress} from '../lib/work';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

type WorkspaceOptions = { askDojo: boolean; solutions: boolean; timer: boolean; freeNav: boolean };
type Props = {
  persistWork?: boolean;
  existingWorkId?: string;
  initialQuestion?: number;
  topic: string;
  mode: 'practice' | 'exam';
  questions: any[];
  options?: Partial<WorkspaceOptions>;
};
type Tab = 'answer' | 'markscheme' | 'solution';
type Message = { role: 'user' | 'assistant'; content: string };

const textOf = (b:any) => String(b?.content ?? b?.text ?? b?.latex ?? '');

function MathText({text}:{text:string}) {
  const bits = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/g).filter(Boolean);
  return <>{bits.map((bit,i) => {
    if (bit.startsWith('$$') && bit.endsWith('$$')) return <BlockMath key={i} math={bit.slice(2,-2)} />;
    if (bit.startsWith('$') && bit.endsWith('$')) return <InlineMath key={i} math={bit.slice(1,-1)} />;
    return <span key={i} style={{whiteSpace:'pre-wrap'}}>{bit}</span>;
  })}</>;
}

function Blocks({blocks}:{blocks:any[]}) {
  if (!Array.isArray(blocks)) return null;
  return <>{blocks.map((b:any,i:number) => {
    const type=b?.type || 'markdown', text=textOf(b);
    if (type==='spacer') return <div className="qSpacer" key={i}/>;
    if (type==='latex') return <div className="displayMath" key={i}><BlockMath math={text}/></div>;
    if (type==='caption') return <div className="renderCaption" key={i}><MathText text={text}/></div>;
    return <div className="renderText" key={i}><MathText text={text}/></div>;
  })}</>;
}

function QuestionDisplay({q}:{q:any}) {
  const blocks=q?.question?.display_blocks || q?.display?.question_blocks || [];
  return blocks.length ? <Blocks blocks={blocks}/> : <MathText text={String(q?.question?.text || '')}/>;
}

const partsOf=(q:any)=>Array.isArray(q?.solution?.parts)?q.solution.parts:[];
const stepBlocks=(s:any)=>s?.display?.working_blocks || s?.working_blocks || [];
const partName=(p:any,i:number)=>String(p?.part ?? p?.label ?? String.fromCharCode(97+i)).replace(/[()]/g,'').toUpperCase();

function AnswerView({q}:{q:any}) {
  const map=q?.display?.answer_blocks;

  if (map && typeof map==='object') {
    const entries=Object.entries(map);

    if(entries.length) return (
      <div className="reviewContent">
        {entries.map(([k,v]:any)=>
          <section className="reviewPart" key={k}>
            {entries.length>1 && (
              <h3>
                {k==='__whole_question__'
                  ? 'Answer'
                  : `Part ${String(k).replace(/[()]/g,'').toUpperCase()}`}
              </h3>
            )}
            <Blocks blocks={v}/>
          </section>
        )}
      </div>
    );
  }

  if (typeof q?.answer==='string') {
    return <div className="reviewContent"><MathText text={q.answer}/></div>;
  }

  return (
    <div className="reviewContent">
      <pre className="answerFallback">
        {JSON.stringify(q?.answer ?? {},null,2)}
      </pre>
    </div>
  );
}

function RevealStep({step,index}:{step:any;index:number}) {
  const [open,setOpen]=useState(false);

  return (
    <div className={'revealStep '+(open?'open':'')}>
      <button onClick={()=>setOpen(!open)}>
        <span><b>{index+1}.</b> {step?.description || `Step ${index+1}`}</span>
        <span>{open?'Hide':'Reveal'}</span>
      </button>

      {open && (
        <div className="revealBody">
          <Blocks blocks={stepBlocks(step)}/>
          {step?.display?.fallback_mark_caption && (
            <div className="renderCaption">
              {step.display.fallback_mark_caption}
            </div>
          )}
          {(step?.display?.student_mark_note_blocks || []).map(
            (x:any,i:number)=><Blocks blocks={x} key={i}/>
          )}
        </div>
      )}
    </div>
  );
}

function MarkSchemeView({q}:{q:any}) {
  const p=partsOf(q), groups=p.length?p:[{steps:q?.solution?.steps||[]}];

  return (
    <div className="reviewContent">
      {groups.map((part:any,pi:number)=>
        <section className="reviewPart" key={pi}>
          {groups.length>1 && <h3>Part {partName(part,pi)}</h3>}
          {(part.steps||[]).map(
            (s:any,si:number)=><RevealStep step={s} index={si} key={si}/>
          )}
        </section>
      )}
    </div>
  );
}

function FullSolutionView({q}:{q:any}) {
  const p=partsOf(q), groups=p.length?p:[{steps:q?.solution?.steps||[]}];

  return (
    <div className="reviewContent">
      {groups.map((part:any,pi:number)=>
        <section className="reviewPart fullWorked" key={pi}>
          {groups.length>1 && (
            <h3>
              Part {partName(part,pi)}
              {' '}
              {part?.marks_available!=null && <span>— {part.marks_available} marks</span>}
            </h3>
          )}

          {(part.steps||[]).map((s:any,si:number)=>
            <div className="workedStep" key={si}>
              {s?.description && <b>{s.description}</b>}
              <Blocks blocks={stepBlocks(s)}/>
              {(s?.display?.answer_note_blocks||[]).map(
                (x:any,i:number)=>
                  <div className="solutionNote" key={i}>
                    <Blocks blocks={x}/>
                  </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function AskDojo({q}:{q:any}) {
  const [open,setOpen]=useState(false);
  const [messages,setMessages]=useState<Message[]>([]);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    setMessages([]);
    setInput('');
    setError('');
  },[q.id]);

  async function send(e:FormEvent) {
    e.preventDefault();

    const prompt=input.trim();
    if(!prompt||busy) return;

    const next=[...messages,{role:'user' as const,content:prompt}];

    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');

    try {
      const r=await fetch(
        (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000') + '/ask-dojo',
        {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            question_id:q.id,
            messages:next
          })
        }
      );

      const data=await r.json();

      if(!r.ok) {
        throw new Error(data.detail||'Ask DOJO could not respond.');
      }

      setMessages([
        ...next,
        {role:'assistant',content:data.text}
      ]);
    } catch(err:any) {
      setError(err.message||'Ask DOJO could not respond.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={'dojoChat '+(open?'open':'')}>
      <button className="dojoChatToggle" onClick={()=>setOpen(!open)}>
        <span>
          <b>Ask DOJO</b>
          <small>Ask about this question</small>
        </span>
        <span>{open?'×':'↑'}</span>
      </button>

      {open && (
        <div className="dojoChatBody">
          <div className="dojoMessages">
            {!messages.length && (
              <p>
                Ask for a hint, an explanation of a step, or why something works.
              </p>
            )}

            {messages.map((m,i)=>
              <div className={'dojoMessage '+m.role} key={i}>
                <MathText text={m.content}/>
              </div>
            )}

            {busy && <div className="dojoMessage assistant">Thinking…</div>}
            {error && <div className="dojoChatError">{error}</div>}
          </div>

          <form onSubmit={send}>
            <input
              value={input}
              onChange={e=>setInput(e.target.value)}
              placeholder="Ask DOJO about this question…"
            />
            <button disabled={busy||!input.trim()}>Send</button>
          </form>
        </div>
      )}
    </div>
  );
}

function SolutionTools({
  q,
  tab,
  setTab
}:{
  q:any;
  tab:Tab;
  setTab:(x:Tab)=>void
}) {
  const [shown,setShown]=useState<Tab|null>(null);

  useEffect(()=>setShown(null),[q.id]);

  const choose=(x:Tab)=>{
    setTab(x);
    setShown(shown===x?null:x);
  };

  return (
    <section className="solutionTools">
      <div className="solutionChoices">
        <span>Solutions</span>

        <div>
          <button
            className={shown==='answer'?'active':''}
            onClick={()=>choose('answer')}
          >
            Answer
          </button>

          <button
            className={shown==='markscheme'?'active':''}
            onClick={()=>choose('markscheme')}
          >
            Mark scheme
          </button>

          <button
            className={shown==='solution'?'active':''}
            onClick={()=>choose('solution')}
          >
            Full solution
          </button>
        </div>
      </div>

      {shown && (
        <div className="solutionReveal">
          {tab==='answer'&&<AnswerView q={q}/>}
          {tab==='markscheme'&&<MarkSchemeView q={q}/>}
          {tab==='solution'&&<FullSolutionView q={q}/>}
        </div>
      )}
    </section>
  );
}

export default function PracticeSession({
  topic,
  mode,
  questions,
  options:rawOptions,
  persistWork,
  existingWorkId,
  initialQuestion = 0
}:Props) {
  const [workId,setWorkId]=useState<string|null>(existingWorkId ?? null);

  useEffect(()=>{
    if(!persistWork || workId || !questions.length) return;

    const key='dojo-work:'+questions.map((q:any)=>q.id).join('|');
    const existing=sessionStorage.getItem(key);

    if(existing){
      setWorkId(existing);
      return;
    }

    createWorkItem({
      kind:'question_set',
      title:topic||'Question Set',
      question_ids:questions.map((q:any)=>q.id),
      settings:{mode}
    })
      .then(w=>{
        sessionStorage.setItem(key,w.id);
        setWorkId(w.id);
      })
      .catch(err=>console.error('Could not persist DOJO work item',err));
  },[persistWork,workId,questions,topic,mode]);

  const options: WorkspaceOptions = {
    askDojo: rawOptions?.askDojo ?? true,
    solutions: rawOptions?.solutions ?? true,
    timer: rawOptions?.timer ?? false,
    freeNav: rawOptions?.freeNav ?? true,
  };

  const safeInitialQuestion = Math.max(
    0,
    Math.min(initialQuestion, Math.max(0, questions.length - 1))
  );
  const [index,setIndex]=useState(safeInitialQuestion);
  const [stage,setStage]=useState<'doing'|'marking'|'results'>('doing');
  const [tab,setTab]=useState<Tab>('answer');
  const [marks,setMarks]=useState<Record<string,number>>({});
  const [startedAt]=useState(()=>new Date().toISOString());
  const [elapsed,setElapsed]=useState(0);
  const [timerPaused,setTimerPaused]=useState(false);

  const q=questions[index];
  const max=Number(q.marks)||0;

  const totalMarks=useMemo(
    ()=>questions.reduce((n,x)=>n+(Number(x.marks)||0),0),
    [questions]
  );

  const awarded=questions.reduce(
    (n,x)=>n+(marks[x.id]||0),
    0
  );

  const storageKey=`dojo-session-${topic}-${startedAt}`;

  useEffect(()=>{
    const payload={
      id:storageKey,
      topic,
      mode,
      status:
        stage==='doing'
          ? 'in-progress'
          : stage==='marking'
            ? 'marking'
            : 'marked',
      questionIds:questions.map(x=>x.id),
      currentQuestion:index,
      marks,
      totalMarks,
      awarded,
      startedAt,
      updatedAt:new Date().toISOString()
    };

    localStorage.setItem(storageKey,JSON.stringify(payload));

    const ids=JSON.parse(
      localStorage.getItem('dojo-work-index')||'[]'
    );

    if(!ids.includes(storageKey)) {
      localStorage.setItem(
        'dojo-work-index',
        JSON.stringify([storageKey,...ids])
      );
    }
  },[
    index,
    stage,
    marks,
    storageKey,
    topic,
    mode,
    questions,
    totalMarks,
    awarded,
    startedAt
  ]);

  useEffect(()=>{
    if(!options.timer || timerPaused || stage!=='doing') return;

    const id=window.setInterval(
      ()=>setElapsed(v=>v+1),
      1000
    );

    return()=>window.clearInterval(id);
  },[options.timer,timerPaused,stage]);

  const move=(i:number)=>{
    setIndex(i);
    setTab('answer');

    if(workId){
      updateWorkProgress(workId,i)
        .catch(err=>console.error('Could not save DOJO progress',err));
    }
  };

  const setMark=(v:number)=>
    setMarks({
      ...marks,
      [q.id]:Math.max(
        0,
        Math.min(
          max,
          Number.isFinite(v)?v:0
        )
      )
    });

  if(stage==='results') {
    return (
      <section className="sessionResults">
        <div className="sessionEyebrow">
          {topic} · {mode==='exam'?'Exam':'Practice'}
        </div>

        <h1>Finished</h1>

        <div className="resultScore">
          <strong>{awarded}</strong>
          <span>/ {totalMarks} marks</span>
        </div>

        <p>
          Your question-by-question marks have been saved on this device.
        </p>

        <div className="resultQuestions">
          {questions.map((x,i)=>
            <button
              key={x.id}
              onClick={()=>{
                move(i);
                setStage('marking');
              }}
            >
              <span>Question {i+1}</span>
              <b>{marks[x.id]||0}/{x.marks}</b>
            </button>
          )}
        </div>

        <div className="sessionEndActions">
          <Link
            className="primarySessionButton"
            href="/topics"
          >
            Practise again
          </Link>

          <Link
            className="secondarySessionButton"
            href="/my-work"
          >
            Go to My Work
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="practiceSession">
      <header className="sessionHeader">
        <div>
          <div className="sessionEyebrow">
            {topic} · {mode==='exam'?'Exam mode':'Practice mode'}
          </div>

          <h1>Question {index+1}</h1>
        </div>

        <div className="sessionHeaderRight">
          {options.timer && (
            <div className="practiceTimer">
              <span>
                {Math.floor(elapsed/60)}:
                {String(elapsed%60).padStart(2,'0')}
              </span>

              <button onClick={()=>setTimerPaused(v=>!v)}>
                {timerPaused?'Resume':'Pause'}
              </button>
            </div>
          )}

          <div className="sessionProgress">
            <span>{index+1} of {questions.length}</span>

            <div>
              <i
                style={{
                  width:`${((index+1)/questions.length)*100}%`
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="questionWorkspace">
        <div className="questionColumn">
          <div className="questionPaper edexcelPaper">
            <div className="paperQuestionNumber">
              {index+1}.
            </div>

            <div className="questionBody">
              <QuestionDisplay q={q}/>
            </div>

            <div className="paperMarks">
              ({q.marks})
            </div>
          </div>

          {options.solutions &&
            (mode==='practice'||stage==='marking') && (
              <SolutionTools
                q={q}
                tab={tab}
                setTab={setTab}
              />
            )}
        </div>

        {options.askDojo && mode==='practice' && (
          <aside className="dojoColumn">
            <div className="dojoColumnHeading">
              <b>Ask DOJO</b>
              <span>Question {index+1}</span>
            </div>

            <AskDojo q={q}/>
          </aside>
        )}
      </div>

      <footer className="sessionNav">
        <button
          className="secondarySessionButton"
          disabled={index===0}
          onClick={()=>move(Math.max(0,index-1))}
        >
          ← Previous
        </button>

        <div className="questionDots">
          {questions.map((x,i)=>
            <button
              disabled={!options.freeNav&&i!==index}
              aria-label={`Question ${i+1}`}
              className={`${i===index?'active ':''}${marks[x.id]!==undefined?'marked':''}`}
              key={x.id}
              onClick={()=>move(i)}
            >
              {i+1}
            </button>
          )}
        </div>

        {stage==='doing'
          ? (
            index<questions.length-1
              ? (
                <button
                  className="primarySessionButton"
                  onClick={()=>move(index+1)}
                >
                  Next →
                </button>
              )
              : (
                <button
                  className="primarySessionButton"
                  onClick={()=>{
                    move(0);
                    setStage('marking');
                  }}
                >
                  Finish & mark
                </button>
              )
          )
          : (
            index<questions.length-1
              ? (
                <button
                  className="primarySessionButton"
                  onClick={()=>move(index+1)}
                >
                  Save mark & next →
                </button>
              )
              : (
                <button
                  className="primarySessionButton"
                  onClick={()=>setStage('results')}
                >
                  Finish marking
                </button>
              )
          )}
      </footer>
    </section>
  );
}