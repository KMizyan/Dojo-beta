'use client';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {createWorkItem, completeWorkItem, beginMarkingWorkItem, updateWorkSettings} from '../lib/work';
import {useEffect,useMemo,useState} from 'react';
import {BlockMath,InlineMath} from 'react-katex';
import 'katex/dist/katex.min.css';

const textOf=(b:any)=>String(b?.content??b?.text??b?.latex??'');

function MathText({text}:{text:string}) {
  const normalised=String(text??'')
    .replace(/\\\$/g,'$')
    .replace(/\\\(/g,'$')
    .replace(/\\\)/g,'$')
    .replace(/\\\[/g,'$$')
    .replace(/\\\]/g,'$$');
  const bits=normalised.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g).filter(Boolean);
  return <>{bits.map((bit,i)=>{
    if(bit.startsWith('$$')&&bit.endsWith('$$')) return <BlockMath key={i} math={bit.slice(2,-2).trim()}/>;
    if(bit.startsWith('$')&&bit.endsWith('$')) {
      const math=bit.slice(1,-1).trim();
      const tall=/\\(?:int|sum|prod|lim)\b|\\frac\s*\{|\\dfrac\s*\{/.test(math);
      return <span key={i} className={tall?'examTallInlineMath':'examInlineMath'}><InlineMath math={tall?`\\displaystyle ${math}`:math}/></span>;
    }
    return <span key={i} style={{whiteSpace:'pre-wrap'}}>{bit}</span>;
  })}</>;
}

function getPartMarks(q:any){
  const parts=Array.isArray(q?.solution?.parts)?q.solution.parts:[];
  return parts.map((part:any)=>{
    if(Number.isFinite(Number(part?.marks))) return Number(part.marks);
    return (Array.isArray(part?.steps)?part.steps:[]).reduce((total:number,step:any)=>{
      const marks=step?.marks;
      if(Array.isArray(marks)){
        return total+marks.reduce((n:number,m:any)=>n+(Number(m?.marks??m?.value??m)||0),0);
      }
      return total+(Number(marks)||0);
    },0);
  });
}

function ExamQuestion({q,index}:{q:any;index:number}){
  const blocks=q?.question?.display_blocks||q?.display?.question_blocks||[];
  const partMarks=getPartMarks(q);
  let part=-1;
  const rendered=blocks.map((b:any,i:number)=>{
    const type=b?.type||'markdown';
    const text=textOf(b);
    const isPart=/^\s*\([a-z]\)/i.test(text);
    if(isPart) part++;
    const mark=isPart&&partMarks[part]>0?partMarks[part]:null;

    let content;
    if(type==='spacer') content=<div className="examSpacer"/>;
    else if(type==='latex') content=<div className="examDisplayMath"><BlockMath math={text.replace(/^\$+|\$+$/g,'').trim()}/></div>;
    else if(type==='caption') content=<div className="examCaption"><MathText text={text}/></div>;
    else content=<div className={isPart?'examText examPartText':'examText'}><MathText text={text}/></div>;

    return <div className={isPart?'examPartBlock':''} key={i}>
      {content}
      {mark!==null&&<div className="examPartMarks">({mark})</div>}
    </div>;
  });

  const splitMarks=partMarks.filter((x:number)=>x>0).length>1;
  return <section className="examQuestion">
    <div className="examQuestionNumber">{index+1}.</div>
    <div className="examQuestionContent">
      {blocks.length?rendered:<MathText text={String(q?.question?.text||'')}/>}
      {!splitMarks&&<div className="examQuestionMarks">({q.marks})</div>}
    </div>
  </section>;
}

function formatTime(seconds:number){
  const m=Math.floor(seconds/60),s=seconds%60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

type PaperOptions={examMode:boolean;askDojo:boolean;solutions:boolean;timer:boolean;freeNav:boolean};
type ExamVariant='paper'|'question_set';

type GeneratedExamProps={
  paper:any;
  options?:Partial<PaperOptions>;
  variant?:ExamVariant;
  questionSetTitle?:string;
};

export default function GeneratedExam({
  paper,
  options,
  variant='paper',
  questionSetTitle
}:GeneratedExamProps){
  const router=useRouter();
  const workspace:PaperOptions={examMode:options?.examMode??true,askDojo:options?.askDojo??false,solutions:options?.solutions??false,timer:options?.timer??true,freeNav:options?.freeNav??false};
  const isQuestionSet=variant==='question_set';
  const [started,setStarted]=useState(false);
  const [seconds,setSeconds]=useState(0);
  const [finished,setFinished]=useState(false);
  const [paused,setPaused]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const saveFinishedPaper=async(markNow:boolean)=>{
    if(saving)return;
    setSaving(true);
    setSaveError('');

    try{
      const questionIds=(paper.questions||[])
        .map((q:any)=>String(q?.id||''))
        .filter(Boolean);

      if(!questionIds.length){
        throw new Error('This paper has no saveable question IDs.');
      }

      const timeTag=
        workspace.timer
          ? ` · ${formatTime(seconds)}`
          : '';

      const savedTitle=isQuestionSet
        ? `${questionSetTitle || 'Question Set'} · Exam mode${timeTag}`
        : `DOJO ${paper.level} ${paper.area} paper`;

      const work=await createWorkItem({
        kind:isQuestionSet
          ? 'question_set'
          : 'generated_paper',
        title:savedTitle,
        question_ids:questionIds,
        settings:{
          paper,
          workspace,
          mode:'exam',
          examMode:true,
          timer:workspace.timer,
          elapsedSeconds:seconds,
          totalMarks:paper.total_marks,
          requestedMarks:paper.requested_marks,
          source:isQuestionSet
            ? 'question_set_exam'
            : 'generated_paper'
        },
      });

      await completeWorkItem(work.id);

      if(markNow){
        await beginMarkingWorkItem(work.id);
        router.push(`/practice?work=${encodeURIComponent(work.id)}&mode=mark`);
      }else{
        router.push('/');
      }
    }catch(err:any){
      setSaveError(err?.message||'Could not save this paper.');
      setSaving(false);
    }
  };

  const leavePaper=()=>{
    const noun=isQuestionSet
      ? 'question set'
      : 'paper';

    const ok=window.confirm(
      `Leave this ${noun} without saving? Your progress will be lost.`
    );

    if(ok){
      router.push(
        isQuestionSet
          ? '/question-sets'
          : '/papers'
      );
    }
  };
  useEffect(()=>{
    if(!workspace.timer||!started||finished||paused)return;
    const id=window.setInterval(()=>setSeconds(v=>v+1),1000);
    return()=>window.clearInterval(id);
  },[workspace.timer,started,finished,paused]);

  const suggestedMinutes=useMemo(()=>Math.max(20,Math.round((paper.total_marks||paper.requested_marks)*1.2)),[paper]);
  const title=isQuestionSet
    ? (questionSetTitle || 'Question Set')
    : paper.area==='Pure'
      ? 'Pure Mathematics'
      : paper.area;

  if(!started)return <main className="generatedExamPage"><div className="examCover">
    <div className="examCoverTop"><div className="examBrand">DOJO</div><div className="examGeneratedTag">GENERATED PAPER</div></div>
    <div className="examCoverRule"/>
    <div className="examCoverLevel">{paper.level} Mathematics</div><h1>{title}</h1>
    <div className="examCoverFacts">
      <div><span>Paper</span><strong>{title}</strong></div>
      <div><span>Total marks</span><strong>{paper.total_marks}</strong></div>
      <div><span>Suggested time</span><strong>{suggestedMinutes} minutes</strong></div>
      <div><span>Questions</span><strong>{paper.questions.length}</strong></div>
    </div>
    <section className="examInstructions"><h2>Instructions</h2><ul>
      <li>Answer all questions.</li><li>Do your working on paper.</li>
      <li>Give exact answers where appropriate unless the question states otherwise.</li>
      <li>Solutions and Ask DOJO are unavailable until you finish the paper.</li>
    </ul></section>
    <section className="examAdvice"><h2>Advice</h2><p>Read each question carefully. Try to answer every question and check your work if you have time.</p></section>
    <button className="startExamButton" onClick={()=>setStarted(true)}>Start paper</button>
    <button className="leaveExamLink" type="button" onClick={()=>router.push('/papers')}>Back to Papers</button>
  </div></main>;

  return <main className="generatedExamPage paperRunning">
    <div className="examStickyBar">
      <div><b>{paper.level} - {title}</b><span>{paper.total_marks} marks</span></div>
      <div className="examStickyRight">
        {workspace.timer&&<span>{formatTime(seconds)}</span>}
        {!finished&&<button className="pauseExamButton" onClick={()=>setPaused(true)}>Pause</button>}
        {!finished&&<button className="pauseExamButton" onClick={leavePaper}>Back to Papers</button>}
        {!finished&&<button onClick={()=>{setPaused(false);setFinished(true)}}>Finish paper</button>}
      </div>
    </div>

    {paused&&<div className="examPauseOverlay">
      <div className="examPauseCard">
        <div className="examPauseLabel">PAPER PAUSED</div>
        <h2>{formatTime(seconds)}</h2>
        <p>The timer is stopped and the questions are hidden.</p>
        <button onClick={()=>setPaused(false)}>Resume paper</button>
      </div>
    </div>}

    {finished&&
      <div className="examFinishedFixed">
        <div className="examFinishedFixedInner">
          <div className="examFinishedFixedCopy">
            <b>Paper finished</b>
            <span>
              {saveError
                ? saveError
                : 'Save for marking later, or mark it now.'}
            </span>
          </div>

          <div className="examFinishedFixedActions">
            <button
              type="button"
              disabled={saving}
              onClick={()=>saveFinishedPaper(false)}
            >
              {saving ? 'Saving...' : 'Save for later'}
            </button>

            <button
              className="examFinishedFixedPrimary"
              type="button"
              disabled={saving}
              onClick={()=>saveFinishedPaper(true)}
            >
              Mark now
            </button>
          </div>
        </div>
      </div>
    }

    <article className={`continuousPaper ${paused?'paperIsPaused':''}`}>
      <header className="paperMiniHeader"><span>DOJO</span><span>{paper.level} Mathematics - {title}</span></header>
      {paper.questions.map((q:any,i:number)=><ExamQuestion q={q} index={i} key={q.id||i}/>)}
      <footer className="endOfPaper"><b>END OF PAPER</b><span>Total for paper: {paper.total_marks} marks</span></footer>
    </article>
    {finished&&
      <div className="examFinishedBar">
        <div>
          <b>Paper finished</b>
          <span>
            {saveError
              ? saveError
              : 'Save this paper for marking later, or mark it now.'}
          </span>
        </div>

        <div style={{display:'flex',gap:'10px'}}>
          <button
            type="button"
            disabled={saving}
            onClick={()=>saveFinishedPaper(false)}
          >
            {saving ? 'Saving...' : 'Save for later'}
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={()=>saveFinishedPaper(true)}
          >
            Mark now
          </button>
        </div>
      </div>
    }
  </main>;
}

