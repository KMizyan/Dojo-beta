'use client';

import Link from 'next/link';
import {
  consumeTrialEntitlement,
  releaseTrialEntitlement
} from '../lib/entitlements';
import {
  createWorkItem,
  updateWorkProgress,
  saveQuestionMark,
  completeWorkItem,
  beginMarkingWorkItem,
  finishMarkingWorkItem,
  saveWorkItem,
  getQuestionFlags,
  flagQuestion,
  unflagQuestion
} from '../lib/work';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { BlockMath, InlineMath } from 'react-katex';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { supabase } from '../lib/supabase';

type WorkspaceOptions = { askDojo: boolean; solutions: boolean; timer: boolean; freeNav: boolean };
type Props = {
  persistWork?: boolean;
  existingWorkId?: string;
  initialQuestion?: number;
  initialStage?: 'doing' | 'marking' | 'results';
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

function SenseiText({text}:{text:string}) {
  return (
    <div className="senseiMarkdown">
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
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

export function QuestionDisplay({q}:{q:any}) {
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

export function MarkSchemeView({q}:{q:any}) {
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

export function FullSolutionView({q}:{q:any}) {
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
  const [messages,setMessages]=useState<Message[]>([]);
  const responseStartRef=useRef<HTMLDivElement|null>(null);
  const [input,setInput]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [membershipRequired,setMembershipRequired]=
    useState(false);

  useEffect(()=>{
    setMessages([]);
    setInput('');
    setError('');
  },[q.id]);

  useEffect(()=>{
    if(!busy) return;

    const frame=requestAnimationFrame(()=>{
      const response=responseStartRef.current;
      const messages=response?.closest('.dojoMessages') as HTMLElement | null;

      if(response && messages){
        const targetTop=
          response.offsetTop -
          messages.offsetTop -
          16;

        messages.scrollTo({
          top:Math.max(0,targetTop),
          behavior:'smooth'
        });
      }
    });

    return ()=>cancelAnimationFrame(frame);
  },[busy]);

  async function send(e:FormEvent) {
    e.preventDefault();

    const prompt=input.trim();
    if(!prompt||busy) return;

    const questionKey=String(q.id ?? '');

    if(!questionKey){
      setError('SENSEI could not identify this question.');
      return;
    }

    const next=[
      ...messages,
      {role:'user' as const,content:prompt}
    ];

    setMessages(next);
    setInput('');
    setBusy(true);
    setError('');
    setMembershipRequired(false);

    let entitlementConsumed=false;

    try {
      const entitlement=
        await consumeTrialEntitlement(
          'ask_dojo_question',
          questionKey
        );

      if(!entitlement.allowed){
        setMembershipRequired(true);
        throw new Error(
          `You've used SENSEI on ${entitlement.allowance} unique questions during your trial. You can still continue SENSEI conversations on questions you've already used it on.`
        );
      }

      entitlementConsumed=entitlement.consumed;

      const r=await fetch(
        (process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000') + '/ask-dojo',
        {
          method:'POST',
          headers:{
            'Content-Type':'application/json'
          },
          body:JSON.stringify({
            question_id:q.id,
            messages:next
          })
        }
      );

      const data=await r.json();

      if(!r.ok) {
        throw new Error(
          data.detail || 'SENSEI could not respond.'
        );
      }

      if(!data.text){
        throw new Error(
          'SENSEI returned an empty response.'
        );
      }

      /*
        The AI successfully assisted this canonical question.
        Keep the entitlement usage row.
      */
      entitlementConsumed=false;

      setMessages([
        ...next,
        {
          role:'assistant',
          content:data.text
        }
      ]);

    } catch(err:any) {
      /*
        Only refund when THIS request created the entitlement row
        and the AI request subsequently failed.

        Existing usage for the same question is never deleted.
      */
      if(entitlementConsumed){
        try{
          await releaseTrialEntitlement(
            'ask_dojo_question',
            questionKey
          );
        }catch(releaseError){
          console.error(
            'Could not release SENSEI trial use:',
            releaseError
          );
        }
      }

      setError(
        err.message || 'SENSEI could not respond.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`dojoChat ${messages.length || busy || error ? 'open' : 'collapsed'}`}>
      <div className="dojoChatBody">

        <div className="dojoMessages">

          {!messages.length && (
            <p className="senseiIntro">
                <strong>SENSEI can see this question.</strong><br />
                Ask about the problem, explore the maths behind it,
                or take the conversation wherever you need.
              </p>
          )}

          {messages.map((m,i)=>(
            <div
              className={'dojoMessage '+m.role}
              key={i}
            >
              {m.role === 'assistant'
                ? <SenseiText text={m.content}/>
                : <MathText text={m.content}/>}
            </div>
          ))}

          {busy && (
            <div ref={responseStartRef} className="dojoMessage assistant">
              Thinking…
            </div>
          )}

          {error && (
            <div className="dojoChatError">
              {error}

              {membershipRequired && (
                <div style={{marginTop:'8px'}}>
                  <Link href="/account">
                    View membership →
                  </Link>
                </div>
              )}</div>
          )}

        </div>

        <form onSubmit={send}>
          <textarea
            className="senseiComposerInput"
            rows={1}
            value={input}
            onChange={e=>{
              setInput(e.target.value);
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height =
                `${Math.min(e.currentTarget.scrollHeight, 144)}px`;
            }}
            onKeyDown={e=>{
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask SENSEI…"
          />

          <button
            disabled={busy||!input.trim()}
          >
            Send
          </button>
        </form>

      </div>
    </div>
  );
}
function SolutionTools({
  q,
  tab,
  setTab,
  openByDefault = true
}:{
  q:any;
  tab:Tab;
  setTab:(x:Tab)=>void;
  openByDefault?:boolean;
}) {
  const [shown,setShown]=useState<Tab|null>(
    openByDefault ? 'answer' : null
  );

  useEffect(()=>{
    setTab('answer');
    setShown(openByDefault ? 'answer' : null);
  },[q.id,setTab,openByDefault]);

  const choose=(x:Tab)=>{
    if (!openByDefault && shown===x) {
      setShown(null);
      return;
    }

    setTab(x);
    setShown(x);
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
  initialQuestion = 0,
  initialStage = 'doing'
}:Props) {
  const [workId,setWorkId]=useState<string|null>(existingWorkId ?? null);
  const workCreationRef=useRef<Promise<string>|null>(null);
  const [loggedIn,setLoggedIn]=useState<boolean|null>(null);
  const [authNotice,setAuthNotice]=useState('');

  useEffect(()=>{
    let cancelled=false;

    supabase.auth.getUser()
      .then(({data})=>{
        if(!cancelled) setLoggedIn(Boolean(data.user));
      })
      .catch(()=>{
        if(!cancelled) setLoggedIn(false);
      });

    return()=>{ cancelled=true; };
  },[]);

  const requireAccount=(message:string)=>{
    setAuthNotice(message);
  };

  const ensureWorkItem=async():Promise<string|null>=>{
    if(workId) return workId;
    if(loggedIn!==true || !persistWork || !questions.length) return null;

    if(!workCreationRef.current){
      workCreationRef.current=createWorkItem({
        kind:'question_set',
        title:topic||'Question Set',
        question_ids:questions.map((q:any)=>q.id),
        settings:{mode}
      })
        .then(w=>{
          setWorkId(w.id);
          return w.id;
        })
        .catch(err=>{
          workCreationRef.current=null;
          throw err;
        });
    }

    return workCreationRef.current;
  };

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

  useEffect(()=>{
    if(typeof window === 'undefined' || !questions.length) return;

    const url = new URL(window.location.href);

    // Only lock a normal Topics practice session that does not
    // already have an explicit question selection.
    if(!url.searchParams.has('ids') && !url.searchParams.has('work')){
      const ids = questions
        .map((question:any)=>String(question?.id || question?.source_question_id || ''))
        .filter(Boolean);

      if(ids.length === questions.length){
        url.searchParams.set('ids',ids.join(','));
        url.searchParams.set('resumeQuestion',String(index));
        window.history.replaceState(null,'',url.toString());
      }
    }
  },[]);

  const [stage,setStage]=useState<'doing'|'marking'|'results'>(initialStage);
  const [tab,setTab]=useState<Tab>('answer');
  const [marks,setMarks]=useState<Record<string,number>>({});
  const [flaggedQuestions,setFlaggedQuestions]=useState<Set<string>>(
    () => new Set()
  );
  const [flagBusy,setFlagBusy]=useState<string|null>(null);
  const [flagError,setFlagError]=useState('');
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


  useEffect(()=>{
    let cancelled=false;

    getQuestionFlags()
      .then(flags=>{
        if(cancelled) return;

        setFlaggedQuestions(
          new Set(
            flags.map((flag:any)=>String(flag.question_id))
          )
        );
      })
      .catch(err=>{
        if(cancelled) return;
        console.warn('Could not load question flags',err);
        setFlagError(
          err instanceof Error
            ? err.message
            : JSON.stringify(err)
        );
      });

    return ()=>{
      cancelled=true;
    };
  },[]);

  const storageKey=`dojo-session-${topic}-${startedAt}`;

  useEffect(()=>{
    if(stage==='results'){
      const activeRecovery =
        localStorage.getItem('dojo-continue');

      if(activeRecovery===storageKey){
        localStorage.removeItem('dojo-continue');
      }

      localStorage.removeItem(storageKey);
      return;
    }
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

    // The newest active session is the ONLY Continue target.
    localStorage.setItem('dojo-continue',storageKey);

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

    if(typeof window !== 'undefined'){
      const url = new URL(window.location.href);
      url.searchParams.set('resumeQuestion',String(i));
      window.history.replaceState(null,'',url.toString());
    }

    if(workId){
      updateWorkProgress(workId,i)
        .catch(err=>console.error('Could not save DOJO progress',err));
    }
  };

  const saveAndExit=async()=>{
    if(loggedIn===false){
      requireAccount('Create a free account to save this work and continue it later.');
      return;
    }

    try {
      const id=await ensureWorkItem();
      if(!id) return;

      await saveWorkItem(id,index);
      window.history.back();
    } catch(err) {
      console.error('Could not save DOJO work',err);
    }
  };

 const toggleQuestionFlag=async()=>{
  const questionId=String(q?.id ?? q?.question_id ?? q?.ref ?? '');

  if(loggedIn===false){
    requireAccount('Create a free account to flag questions and return to them later.');
    return;
  }

  if(!questionId || flagBusy===questionId) return;

  const isFlagged=flaggedQuestions.has(questionId);

  setFlagBusy(questionId);
  setFlagError('');

  try {
    if(isFlagged) {
      await unflagQuestion(questionId);

      setFlaggedQuestions(current=>{
        const next=new Set(current);
        next.delete(questionId);
        return next;
      });
    } else {
      await flagQuestion(questionId);

      setFlaggedQuestions(current=>{
        const next=new Set(current);
        next.add(questionId);
        return next;
      });
    }
  } catch(err:any) {
    console.warn('Could not update question flag',err);
    const flagMessage =
      err instanceof Error
        ? err.message
        : (err?.message || JSON.stringify(err));

    setFlagError(
      flagMessage || 'Could not update this question flag.'
    );
    setFlagError(
      err?.message || 'Could not update this question flag.'
    );
  } finally {
    setFlagBusy(null);
  }
};

 const setMark=(v:number)=>{
  const awardedMark=Math.max(
    0,
    Math.min(
      max,
      Number.isFinite(v)?v:0
    )
  );

  setMarks({
    ...marks,
    [q.id]:awardedMark
  });

  if(workId){
    saveQuestionMark({
      workId,
      questionId:q.id,
      marksAwarded:awardedMark,
      marksAvailable:max
    }).catch(err=>
      console.error('Could not save question mark',err)
    );
  }
};

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
          {loggedIn
            ? 'Your question-by-question marks have been saved.'
            : 'This result is not saved. Create a Trial account to save future work and build your DOJO history.'}
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
          <button
            className="secondarySessionButton"
            type="button"
            onClick={()=>window.history.back()}
          >
            ← Back
          </button>

          <button
            className="secondarySessionButton"
            type="button"
            onClick={saveAndExit}
          >
            Save & exit
          </button>

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

      {authNotice && (
        <div
          style={{
            margin:'0 0 18px',
            padding:'14px 16px',
            border:'1px solid #d9d9d9',
            borderRadius:'8px',
            background:'#fff',
            display:'flex',
            alignItems:'center',
            justifyContent:'space-between',
            gap:'16px'
          }}
        >
          <span>{authNotice}</span>
          <span style={{display:'flex',gap:'12px',flexShrink:0}}>
            <Link href="/login" style={{fontWeight:700}}>Log in</Link>
            <Link href="/signup" style={{fontWeight:700}}>Create account →</Link>
          </span>
        </div>
      )}

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

          {mode==='practice' &&
           stage==='doing' &&
           options.solutions && (
            <div className="practiceSolutionTools">
              <SolutionTools
                q={q}
                tab={tab}
                setTab={setTab}
                openByDefault={false}
              />
            </div>
          )}

          {stage !== 'doing' && (
            <div
              style={{
                marginTop:'14px',
                padding:'18px 20px',
                border:'1px solid #d9d9d9',
                background:'#fff',
                display:'flex',
                alignItems:'center',
                justifyContent:'space-between',
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

                <strong style={{fontSize:'18px'}}>
                  {marks[q.id] ?? 0} / {max}
                </strong>
              </div>

              <div
                style={{
                  display:'flex',
                  alignItems:'center',
                  gap:'8px'
                }}
              >
                <button
                  type="button"
                  onClick={toggleQuestionFlag}
                  disabled={flagBusy===String(q?.id ?? q?.question_id ?? q?.ref ?? '')}
                  style={{
                    minHeight:'38px',
                    padding:'0 14px',
                    border:flaggedQuestions.has(String(q?.id ?? q?.question_id ?? q?.ref ?? ''))
                      ? '1px solid #111'
                      : '1px solid #ccc',
                    background:flaggedQuestions.has(String(q?.id ?? q?.question_id ?? q?.ref ?? ''))
                      ? '#111'
                      : '#fff',
                    color:flaggedQuestions.has(String(q?.id ?? q?.question_id ?? q?.ref ?? ''))
                      ? '#fff'
                      : '#222',
                    borderRadius:'6px',
                    font:'inherit',
                    fontWeight:700,
                    cursor:flagBusy===String(q?.id ?? q?.question_id ?? q?.ref ?? '')
                      ? 'default'
                      : 'pointer'
                  }}
                >
                  {flagBusy===String(q?.id ?? q?.question_id ?? q?.ref ?? '')
                    ? 'Saving...'
                    : flaggedQuestions.has(String(q?.id ?? q?.question_id ?? q?.ref ?? ''))
                      ? 'Flagged for later'
                      : 'Flag for later'}
                </button>

                <button
                  type="button"
                  onClick={()=>setMark((marks[q.id] ?? 0)-1)}
                  disabled={(marks[q.id] ?? 0)<=0}
                  style={{
                    width:'38px',
                    height:'38px',
                    border:'1px solid #ccc',
                    background:'#fff',
                    borderRadius:'6px',
                    fontSize:'20px',
                    cursor:'pointer'
                  }}
                >
                  −
                </button>

                <input
                  type="number"
                  min={0}
                  max={max}
                  value={marks[q.id] ?? 0}
                  onChange={e=>setMark(Number(e.target.value))}
                  style={{
                    width:'64px',
                    height:'38px',
                    textAlign:'center',
                    border:'1px solid #ccc',
                    borderRadius:'6px',
                    font:'inherit',
                    fontWeight:700
                  }}
                />

                <button
                  type="button"
                  onClick={()=>setMark((marks[q.id] ?? 0)+1)}
                  disabled={(marks[q.id] ?? 0)>=max}
                  style={{
                    width:'38px',
                    height:'38px',
                    border:'1px solid #ccc',
                    background:'#fff',
                    borderRadius:'6px',
                    fontSize:'20px',
                    cursor:'pointer'
                  }}
                >
                  +
                </button>
              </div>
            </div>
          )}
        </div>

        {stage==='marking' && options.solutions ? (
          <aside className="markingReferenceColumn">
            <SolutionTools
              q={q}
              tab={tab}
              setTab={setTab}
            />
          </aside>
        ) : (
          (options.askDojo || loggedIn===false) &&
          mode==='practice' &&
          stage==='doing' && (
            <aside className="dojoColumn">
              <div className="dojoColumnHeading">
                <b>SENSEI</b>
                <span>Question {index+1}</span>
              </div>

              {loggedIn===false ? (
                <div
                  style={{
                    padding:'20px',
                    border:'1px solid #ddd',
                    borderRadius:'8px',
                    background:'#fff'
                  }}
                >
                  <b>Get help with this question</b>
                  <p style={{margin:'8px 0 14px',color:'#666'}}>
                    Ask SENSEI for hints, explanations and help with individual steps.
                  </p>
                  <Link href="/signup" style={{fontWeight:700}}>
                    Create free account →
                  </Link>
                </div>
              ) : options.askDojo ? (
                <AskDojo q={q}/>
              ) : null}
            </aside>
          )
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

        {stage==='doing' ? (
          index < questions.length-1 ? (
            <button
              className="primarySessionButton"
              onClick={()=>move(index+1)}
            >
              Next →
            </button>
          ) : (
            <button
              className="primarySessionButton"
              onClick={async()=>{
                setIndex(0);
                setTab('answer');
                setStage('marking');

                if(loggedIn===false){
                  return;
                }

                try {
                  const id=await ensureWorkItem();

                  if(id){
                    await saveWorkItem(id,0);
                    await completeWorkItem(id);
                    await beginMarkingWorkItem(id);
                  }
                } catch(err) {
                  console.error('Could not begin marking',err);
                }
              }}
            >
              Finish & mark
            </button>
          )
        ) : (
          index < questions.length-1 ? (
            <button
              className="primarySessionButton"
              onClick={()=>{
                const currentMark = marks[q.id] ?? 0;

                if(workId){
                  saveQuestionMark({
                    workId,
                    questionId:q.id,
                    marksAwarded:currentMark,
                    marksAvailable:max
                  }).catch(err=>
                    console.error('Could not save question mark',err)
                  );
                }

                move(index+1);
              }}
            >
              Save mark & next →
            </button>
          ) : (
            <button
              className="primarySessionButton"
              onClick={()=>{
                const currentMark = marks[q.id] ?? 0;
                setStage('results');

                if(workId){
                  saveQuestionMark({
                    workId,
                    questionId:q.id,
                    marksAwarded:currentMark,
                    marksAvailable:max
                  })
                    .then(()=>finishMarkingWorkItem(workId))
                    .catch(err=>
                      console.error('Could not finish marking',err)
                    );
                }
              }}
            >
              Finish marking
            </button>
          )
        )}
      </footer>
    </section>
  );
}
