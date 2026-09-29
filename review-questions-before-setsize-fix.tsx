'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  QuestionDisplay,
  MarkSchemeView,
  FullSolutionView
} from '../../../components/PracticeSession';

import {
  getQuestionFlags,
  unflagQuestion
} from '../../../lib/work';

import {
  getQuestion,
  getSimilarQuestionCount,
  selectSimilarQuestions
} from '../../../lib/api';

type Stage = 'review' | 'similar';

function questionId(q:any) {
  return String(
    q?.id ??
    q?.question_id ??
    q?.ref ??
    ''
  );
}

function questionLabel(q:any,index:number) {
  return String(
    q?.ref ??
    q?.title ??
    q?.source_question_id ??
    `Question ${index + 1}`
  );
}

function metadata(q:any) {
  return [
    q?.topic,
    q?.family,
    ...(q?.areas ?? []),
    ...(q?.techniques ?? [])
  ]
    .filter(Boolean)
    .map(String)
    .filter(
      (value,index,array) =>
        array.indexOf(value) === index
    );
}

export default function ReviewQuestionsPage() {
  const [questions,setQuestions] =
    useState<any[]>([]);

  const [index,setIndex] =
    useState(0);

  const [selected,setSelected] =
    useState<Set<string>>(new Set());

  const [stage,setStage] =
    useState<Stage>('review');

  const [setSize,setSetSize] =
    useState(10);

  const [loading,setLoading] =
    useState(true);

  const [creating,setCreating] =
    useState(false);

  const [checkingSimilar,setCheckingSimilar] =
    useState(false);

  const [similarAvailable,setSimilarAvailable] =
    useState<number|null>(null);

  const [error,setError] =
    useState('');

  useEffect(()=>{
    let active=true;

    async function load(){
      try{
        const flags=await getQuestionFlags();

        const loaded=(
          await Promise.all(
            flags.map(async flag=>{
              const q=await getQuestion(
                String(flag.question_id)
              );

              return q
                ? {
                    ...q,
                    flagged_at:flag.created_at
                  }
                : null;
            })
          )
        ).filter(Boolean);

        if(!active) return;

        setQuestions(loaded);
      }catch(err:any){
        if(!active) return;

        setError(
          err?.message ||
          'Could not load flagged questions.'
        );
      }finally{
        if(active) setLoading(false);
      }
    }

    load();

    return ()=>{
      active=false;
    };
  },[]);

  const q=questions[index] ?? null;

  const selectedQuestions=useMemo(
    ()=>questions.filter(
      item=>selected.has(questionId(item))
    ),
    [questions,selected]
  );

  function toggleSelected(id:string){
    setSimilarAvailable(null);

    setSelected(current=>{
      const next=new Set(current);

      if(next.has(id)){
        next.delete(id);
      }else{
        next.add(id);
      }

      return next;
    });
  }

  async function removeFlag(){
    if(!q) return;

    const id=questionId(q);

    try{
      await unflagQuestion(id);

      setSelected(current=>{
        const next=new Set(current);
        next.delete(id);
        return next;
      });

      setQuestions(current=>
        current.filter(
          item=>questionId(item)!==id
        )
      );

      setIndex(current=>
        Math.max(
          0,
          Math.min(
            current,
            questions.length-2
          )
        )
      );
    }catch(err:any){
      setError(
        err?.message ||
        'Could not remove flag.'
      );
    }
  }

  async function openSimilarBuilder(){
    if(selected.size===0 || checkingSimilar) return;

    setCheckingSimilar(true);
    setError('');

    try{
      const result=
        await getSimilarQuestionCount(
          Array.from(selected)
        );

      if(
        !result ||
        typeof result.available !== 'number'
      ){
        throw new Error(
          'Could not check similar-question availability.'
        );
      }

      const available=
        Math.max(0,Number(result.available));

      setSimilarAvailable(available);

      if(available > 0){
        setSetSize(
          Math.min(10,available)
        );
      }

      setStage('similar');
    }catch(err:any){
      setError(
        err?.message ||
        'Could not check similar questions.'
      );
    }finally{
      setCheckingSimilar(false);
    }
  }
  async function createSimilarSet(){
    if(
      selected.size===0 ||
      creating ||
      !similarAvailable ||
      similarAvailable < 1
    ) return;

    const requestedSize=
      Math.min(setSize,similarAvailable);

    setCreating(true);
    setError('');

    try{
      const result=
        await selectSimilarQuestions(
          Array.from(selected),
          requestedSize
        );

      const generated=result?.questions ?? [];

      if(!generated.length){
        throw new Error(
          'No similar questions were found for this selection.'
        );
      }

      const ids=generated
        .map(questionId)
        .filter(Boolean);

      if(!ids.length){
        throw new Error(
          'The similar questions did not contain usable IDs.'
        );
      }

      window.location.href =
        `/practice?ids=${encodeURIComponent(
          ids.join(',')
        )}&topic=${encodeURIComponent(
          'Similar practice'
        )}`;
    }catch(err:any){
      setError(
        err?.message ||
        'Could not create similar practice set.'
      );
    }finally{
      setCreating(false);
    }
  }

  if(loading){
    return (
      <main className="reviewQuestions">
        <p>Loading flagged questions...</p>
      </main>
    );
  }

  if(stage==='similar'){
    return (
      <main className="reviewQuestions">
        <div className="topbar">
          <button
            type="button"
            className="textButton"
            onClick={()=>setStage('review')}
          >
            ← Back to review
          </button>

          <Link href="/review">
            Review home
          </Link>
        </div>

        <header className="pageHeader">
          <span>Practise similar</span>
          <h1>Create a new practice set</h1>
          <p>
            Choose which flagged questions should
            define the new set.
          </p>
        </header>

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        <section className="seedPanel">
          <div className="seedList">
            {questions.map((item,i)=>{
              const id=questionId(item);
              const checked=selected.has(id);

              return (
                <label
                  className="seedRow"
                  key={id}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={()=>
                      toggleSelected(id)
                    }
                  />

                  <div>
                    <strong>
                      {questionLabel(item,i)}
                    </strong>

                    <span>
                      {metadata(item)
                        .slice(0,4)
                        .join(' · ') ||
                       'Question metadata'}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="availabilityNotice">
            {similarAvailable === 0 ? (
              <>
                <strong>
                  No sufficiently similar questions available
                </strong>
                <span>
                  The bank does not currently contain another
                  question that meets DOJO's similarity standard
                  for these selections.
                </span>
              </>
            ) : (
              <>
                <strong>
                  {similarAvailable}{' '}
                  {similarAvailable === 1
                    ? 'similar question'
                    : 'similar questions'}{' '}
                  available
                </strong>
                <span>
                  DOJO will not add weaker matches just to make
                  the set larger.
                </span>
              </>
            )}
          </div>

          <div className="setBuilder">
            <div>
              <span className="smallLabel">
                Selected seeds
              </span>

              <strong>
                {selectedQuestions.length}
              </strong>
            </div>

            <label>
              <span className="smallLabel">
                Set size
              </span>

              <select
                value={setSize}
                onChange={event=>
                  setSetSize(
                    Number(event.target.value)
                  )
                }
              >
                {Array.from(
                  {
                    length:
                      Math.max(
                        0,
                        similarAvailable ?? 0
                      )
                  },
                  (_,i)=>i+1
                ).map(value=>(
                  <option
                    value={value}
                    key={value}
                  >
                    {value}{' '}
                    {value===1
                      ? 'question'
                      : 'questions'}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              className="primaryAction"
              disabled={
                selected.size===0 ||
                creating ||
                !similarAvailable
              }
              onClick={createSimilarSet}
            >
              {creating
                ? 'Creating...'
                : 'Create new practice set →'}
            </button>
          </div>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if(!q){
    return (
      <main className="reviewQuestions">
        <Link href="/review">
          ← Review
        </Link>

        <div className="empty">
          <span>Questions</span>
          <h1>No flagged questions</h1>
          <p>
            Flag questions while marking and they
            will appear here.
          </p>
        </div>

        <style jsx>{styles}</style>
      </main>
    );
  }

  const id=questionId(q);

  return (
    <main className="reviewQuestions">
      <div className="topbar">
        <Link href="/review">
          ← Review
        </Link>

        <span>
          {index+1} / {questions.length}
        </span>
      </div>

      <header className="questionHeader">
        <div>
          <span className="smallLabel">
            Flagged question
          </span>

          <h1>
            {questionLabel(q,index)}
          </h1>

          <p>
            {metadata(q)
              .slice(0,5)
              .join(' · ')}
          </p>
        </div>

        <button
          type="button"
          className="removeButton"
          onClick={removeFlag}
        >
          Remove flag
        </button>
      </header>

      {error && (
        <div className="errorBox">
          {error}
        </div>
      )}

      <section className="questionPanel">
        <QuestionDisplay q={q} />
      </section>

      <section className="reviewMaterial">
        <details>
          <summary>Mark scheme</summary>
          <div className="dojoRenderedMaterial">
            <MarkSchemeView q={q} />
          </div>
        </details>

        <details>
          <summary>Worked solution</summary>
          <div className="dojoRenderedMaterial">
            <FullSolutionView q={q} />
          </div>
        </details>
      </section>

      <div className="questionActions">
        <button
          type="button"
          disabled={index===0}
          onClick={()=>
            setIndex(value=>
              Math.max(0,value-1)
            )
          }
        >
          ← Previous
        </button>

        <label className="similarCheck">
          <input
            type="checkbox"
            checked={selected.has(id)}
            onChange={()=>
              toggleSelected(id)
            }
          />

          Practise similar to this
        </label>

        <button
          type="button"
          disabled={
            index>=questions.length-1
          }
          onClick={()=>
            setIndex(value=>
              Math.min(
                questions.length-1,
                value+1
              )
            )
          }
        >
          Next →
        </button>
      </div>

      <div className="similarBar">
        <div>
          <strong>
            {selected.size} selected
          </strong>

          <span>
            Choose flagged questions as seeds for
            a fresh practice set.
          </span>
        </div>

        <button
          type="button"
          className="primaryAction"
          disabled={selected.size===0}
          onClick={openSimilarBuilder}
        >
          {checkingSimilar ? 'Checking...' : 'Practise similar →'}
        </button>
      </div>

      <style jsx>{styles}</style>
    </main>
  );
}

const styles=`
  .reviewQuestions{
    max-width:1000px;
    margin:0 auto;
    padding:32px 24px 80px;
  }

  .topbar{
    display:flex;
    align-items:center;
    justify-content:space-between;
    margin-bottom:28px;
    color:#707772;
    font-size:12px;
  }

  .topbar a,
  .reviewQuestions > a{
    color:#59665e;
    text-decoration:none;
    font-weight:700;
  }

  .textButton{
    border:0;
    background:transparent;
    padding:0;
    cursor:pointer;
    color:#59665e;
    font:inherit;
    font-weight:700;
  }

  .pageHeader{
    margin-bottom:22px;
  }

  .pageHeader > span,
  .smallLabel,
  .empty > span{
    color:#777f79;
    font-size:10px;
    font-weight:800;
    letter-spacing:.1em;
    text-transform:uppercase;
  }

  .pageHeader h1,
  .questionHeader h1{
    margin:6px 0;
    letter-spacing:-.025em;
  }

  .pageHeader p,
  .questionHeader p{
    margin:0;
    color:#707772;
    font-size:13px;
  }

  .questionHeader{
    display:flex;
    justify-content:space-between;
    gap:24px;
    align-items:flex-start;
    margin-bottom:18px;
  }

  .questionHeader h1{
    font-size:26px;
  }

  .removeButton,
  .questionActions button{
    border:1px solid rgba(22,33,26,.14);
    border-radius:9px;
    background:#fff;
    padding:9px 12px;
    cursor:pointer;
    font:inherit;
    font-size:12px;
    font-weight:700;
  }

  button:disabled{
    opacity:.4;
    cursor:default;
  }

  .questionPanel,
  .reviewMaterial,
  .seedPanel,
  .empty{
    border:1px solid rgba(22,33,26,.1);
    border-radius:16px;
    background:rgba(255,255,255,.82);
  }

  .questionPanel{
    min-height:220px;
    padding:28px;
  }

  .questionContent{
    line-height:1.7;
  }

  .reviewMaterial{
    margin-top:16px;
    overflow:hidden;
  }

  .reviewMaterial details{
    padding:0 20px;
    border-bottom:1px solid rgba(22,33,26,.08);
  }

  .reviewMaterial details:last-child{
    border-bottom:0;
  }

  .reviewMaterial summary{
    padding:15px 0;
    cursor:pointer;
    font-size:12px;
    font-weight:800;
  }

  .reviewMaterial details > div{
    padding:0 0 18px;
    color:#3d4741;
    font-size:13px;
    line-height:1.6;
  }

  .questionActions{
    display:grid;
    grid-template-columns:auto 1fr auto;
    gap:16px;
    align-items:center;
    margin-top:18px;
  }

  .similarCheck{
    display:flex;
    justify-content:center;
    align-items:center;
    gap:8px;
    font-size:12px;
    font-weight:700;
  }

  .similarBar{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:24px;
    margin-top:30px;
    padding:18px 20px;
    border:1px solid #cbd6ce;
    border-radius:13px;
    background:#f3f7f4;
  }

  .similarBar strong,
  .similarBar span{
    display:block;
  }

  .similarBar strong{
    font-size:13px;
  }

  .similarBar span{
    margin-top:4px;
    color:#69766d;
    font-size:11px;
  }

  .primaryAction{
    border:0;
    border-radius:9px;
    background:#365441;
    padding:10px 14px;
    color:#fff;
    cursor:pointer;
    font:inherit;
    font-size:12px;
    font-weight:800;
  }

  .seedPanel{
    padding:20px;
  }

  .seedList{
    display:grid;
    gap:8px;
  }

  .seedRow{
    display:flex;
    align-items:flex-start;
    gap:12px;
    padding:14px;
    border:1px solid rgba(22,33,26,.09);
    border-radius:10px;
    background:#fff;
    cursor:pointer;
  }

  .seedRow strong,
  .seedRow span{
    display:block;
  }

  .seedRow strong{
    font-size:13px;
  }

  .seedRow span{
    margin-top:4px;
    color:#7b837e;
    font-size:11px;
  }

  .availabilityNotice{
    margin-top:24px;
    padding:14px 16px;
    border:1px solid #d6dfd8;
    border-radius:10px;
    background:#f5f8f6;
  }

  .availabilityNotice strong,
  .availabilityNotice span{
    display:block;
  }

  .availabilityNotice strong{
    color:#294534;
    font-size:13px;
  }

  .availabilityNotice span{
    margin-top:4px;
    color:#6f7972;
    font-size:11px;
    line-height:1.45;
  }

  .setBuilder{
    display:flex;
    align-items:flex-end;
    gap:20px;
    margin-top:24px;
    padding-top:20px;
    border-top:1px solid rgba(22,33,26,.09);
  }

  .setBuilder > div strong{
    display:block;
    margin-top:5px;
    font-size:22px;
  }

  .setBuilder label{
    display:grid;
    gap:5px;
  }

  .setBuilder select{
    min-height:37px;
    border:1px solid #d7dcd8;
    border-radius:8px;
    background:#fff;
    padding:0 10px;
  }

  .setBuilder .primaryAction{
    margin-left:auto;
  }

  .errorBox{
    margin-bottom:14px;
    padding:11px 13px;
    border:1px solid #dfc5c5;
    border-radius:9px;
    background:#fff7f7;
    font-size:12px;
  }

  .empty{
    margin-top:50px;
    padding:45px;
    text-align:center;
  }

  .empty h1{
    margin:7px 0;
  }

  .empty p{
    margin:0;
    color:#707772;
  }

  @media(max-width:700px){
    .reviewQuestions{
      padding:25px 16px 60px;
    }

    .questionHeader,
    .similarBar,
    .availabilityNotice{
    margin-top:24px;
    padding:14px 16px;
    border:1px solid #d6dfd8;
    border-radius:10px;
    background:#f5f8f6;
  }

  .availabilityNotice strong,
  .availabilityNotice span{
    display:block;
  }

  .availabilityNotice strong{
    color:#294534;
    font-size:13px;
  }

  .availabilityNotice span{
    margin-top:4px;
    color:#6f7972;
    font-size:11px;
    line-height:1.45;
  }

  .setBuilder{
      flex-direction:column;
      align-items:flex-start;
    }

    .questionActions{
      grid-template-columns:1fr 1fr;
    }

    .similarCheck{
      grid-column:1 / -1;
      grid-row:1;
      justify-content:flex-start;
    }

    .setBuilder .primaryAction{
      margin-left:0;
    }
  }
`;