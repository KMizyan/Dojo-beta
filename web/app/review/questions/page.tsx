'use client';

import Link from 'next/link';
import { supabase } from '../../../lib/supabase';
import {useEffect, useMemo, useState,Suspense} from 'react';
import { useSearchParams } from 'next/navigation';
import ReviewMarkingWorkspace from '../../../components/ReviewMarkingWorkspace';

import {
  getQuestionFlags,
  unflagQuestion
} from '../../../lib/work';

import {
  getQuestionsBulk,
  getSimilarQuestionCount,
  selectAllocatedSimilarQuestions
} from '../../../lib/api';

type Stage = 'review' | 'similar' | 'finished';

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

function ReviewQuestionsContent() {
  const searchParams=useSearchParams();

  const requestedSeeds=useMemo(
    ()=>(
      searchParams
        .get('seeds')
        ?.split(',')
        .map(value=>value.trim())
        .filter(Boolean)
      ?? []
    ),
    [searchParams]
  );
  const [questions,setQuestions] =
    useState<any[]>([]);

  const [index,setIndex] =
    useState(0);

  const [selected,setSelected] =
    useState<Set<string>>(new Set());


  const [keepFlagged,setKeepFlagged] =
    useState<Set<string>>(new Set());

  const [finishBusy,setFinishBusy] =
    useState(false);

  const [stage,setStage] =
    useState<Stage>('review');

  const [availableBySeed,setAvailableBySeed] =
    useState<Record<string,number>>({});

  const [seedAllocations,setSeedAllocations] =
    useState<Record<string,number>>({});

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

  const [loggedIn,setLoggedIn]=
    useState<boolean|null>(null);

  useEffect(()=>{
    let active=true;

    async function load(){
      try{
        const {data:auth}=
          await supabase.auth.getUser();

        if(!active) return;

        if(!auth.user){
          setLoggedIn(false);
          setQuestions([]);
          setLoading(false);
          return;
        }

        setLoggedIn(true);

        if(requestedSeeds.length){
          const loaded=(
            await getQuestionsBulk(
              requestedSeeds
            )
          ).filter(Boolean);

          if(!active) return;

          setQuestions(loaded);

          setSelected(
            new Set(
              loaded
                .map(questionId)
                .filter(Boolean)
            )
          );

          setLoading(false);
          return;
        }

        const flags=await getQuestionFlags();

        const loadedFlagQuestions=
          await getQuestionsBulk(
            flags.map(
              flag=>String(flag.question_id)
            )
          );

        const flagsById=
          new Map(
            flags.map(flag=>[
              String(flag.question_id),
              flag
            ])
          );

        const loaded=loadedFlagQuestions.map(q=>{
          const canonicalId=String(
            q?.id ?? ''
          );

          const sourceId=String(
            q?.source_question_id ?? ''
          );

          const flag=
            flagsById.get(canonicalId) ??
            flagsById.get(sourceId);

          return {
            ...q,
            flagged_at:flag?.created_at
          };
        });

        if(!active) return;

        setQuestions(loaded);
      }catch(err:any){
        if(!active) return;

        setError(
          err?.message ||
          'Could not load questions.'
        );
      }finally{
        if(active) setLoading(false);
      }
    }

    load();

    return ()=>{
      active=false;
    };
  },[requestedSeeds]);

  const q=questions[index] ?? null;

  const selectedQuestions=useMemo(
    ()=>questions.filter(
      item=>selected.has(questionId(item))
    ),
    [questions,selected]
  );

  function toggleSelected(id:string){
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

  function toggleKeepFlagged(id:string){
    setKeepFlagged(current=>{
      const next=new Set(current);

      if(next.has(id)){
        next.delete(id);
      }else{
        next.add(id);
      }

      return next;
    });
  }

  async function finishAndRemoveFlags(){
    if(finishBusy) return;

    const removeIds=questions
      .map(questionId)
      .filter(
        id=>id && !keepFlagged.has(id)
      );

    setFinishBusy(true);
    setError('');

    try{
      await Promise.all(
        removeIds.map(
          id=>unflagQuestion(id)
        )
      );

      window.location.href='/review';
    }catch(err:any){
      setError(
        err?.message ||
        'Could not update your flags.'
      );

      setFinishBusy(false);
    }
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

  useEffect(()=>{
    if(stage !== 'similar') return;

    const seedIds=Array.from(selected);

    if(seedIds.length===0){
      setSimilarAvailable(0);
      setAvailableBySeed({});
      setSeedAllocations({});
      return;
    }

    let cancelled=false;

    async function refreshSimilarAvailability(){
      setCheckingSimilar(true);
      setSimilarAvailable(null);
      setError('');

      try{
        const result=
          await getSimilarQuestionCount(seedIds);

        if(cancelled) return;

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

        const perSeed:Record<string,number>={};

        if(Array.isArray(result.available_by_seed)){
          for(const item of result.available_by_seed){
            const id=String(item?.seed_id ?? '');

            if(id){
              perSeed[id]=Math.max(
                0,
                Number(item?.available ?? 0)
              );
            }
          }
        }

        setSimilarAvailable(available);
        setAvailableBySeed(perSeed);

        // Default to a balanced set of up to 10.
        const next:Record<string,number>={};

        seedIds.forEach(id=>{
          next[id]=0;
        });

        const capacity=seedIds.reduce(
          (sum,id)=>sum+(perSeed[id] ?? 0),
          0
        );

        const target=Math.min(10,capacity);
        let assigned=0;

        while(assigned < target){
          let changed=false;

          for(const id of seedIds){
            if(assigned >= target) break;

            if(next[id] < (perSeed[id] ?? 0)){
              next[id] += 1;
              assigned += 1;
              changed=true;
            }
          }

          if(!changed) break;
        }

        setSeedAllocations(next);
      }catch(err:any){
        if(cancelled) return;

        setSimilarAvailable(0);
        setAvailableBySeed({});
        setSeedAllocations({});

        setError(
          err?.message ||
          'Could not check similar questions.'
        );
      }finally{
        if(!cancelled){
          setCheckingSimilar(false);
        }
      }
    }

    refreshSimilarAvailability();

    return ()=>{
      cancelled=true;
    };
  },[stage,selected]);
  async function openSimilarBuilder(){
    if(selected.size===0) return;

    setError('');
    setSimilarAvailable(null);
    setStage('similar');
  }
  const allocatedTotal=
    Object.values(seedAllocations).reduce(
      (sum,value)=>sum+value,
      0
    );

  function setSeedAllocation(
    seedId:string,
    value:number
  ){
    const maximum=availableBySeed[seedId] ?? 0;

    setSeedAllocations(current=>({
      ...current,
      [seedId]:Math.max(
        0,
        Math.min(value,maximum)
      )
    }));
  }

  function balanceAllocations(){
    const seedIds=Array.from(selected);
    const next:Record<string,number>={};

    seedIds.forEach(id=>{
      next[id]=0;
    });

    const capacity=seedIds.reduce(
      (sum,id)=>sum+(availableBySeed[id] ?? 0),
      0
    );

    const target=Math.min(10,capacity);
    let assigned=0;

    while(assigned < target){
      let changed=false;

      for(const id of seedIds){
        if(assigned >= target) break;

        if(next[id] < (availableBySeed[id] ?? 0)){
          next[id] += 1;
          assigned += 1;
          changed=true;
        }
      }

      if(!changed) break;
    }

    setSeedAllocations(next);
  }

  async function createSimilarSet(){
    if(creating || allocatedTotal < 1) return;

    setCreating(true);
    setError('');

    try{
      const allocations=
        Array.from(selected)
          .map(seedId=>({
            seed_id:seedId,
            count:seedAllocations[seedId] ?? 0
          }))
          .filter(item=>item.count > 0);

      const result=
        await selectAllocatedSimilarQuestions(
          allocations
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
      <main className="main practiceShell reviewQuestions reviewQuestionSession">
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

          <div className="allocationBuilder">
            <div className="allocationTop">
              <div>
                <span className="smallLabel">
                  Practice set composition
                </span>

                <strong className="compositionTotal">
                  {allocatedTotal}{' '}
                  {allocatedTotal===1
                    ? 'question'
                    : 'questions'}
                </strong>
              </div>

              <button
                type="button"
                className="balanceButton"
                onClick={balanceAllocations}
                disabled={
                  checkingSimilar ||
                  !similarAvailable
                }
              >
                Balance automatically
              </button>
            </div>

            <div className="allocationList">
              {selectedQuestions.map((item,i)=>{
                const id=questionId(item);
                const available=
                  availableBySeed[id] ?? 0;
                const amount=
                  seedAllocations[id] ?? 0;

                return (
                  <div
                    className="allocationRow"
                    key={id}
                  >
                    <div className="allocationQuestion">
                      <strong>
                        {questionLabel(item,i)}
                      </strong>

                      <span>
                        {metadata(item)
                          .slice(0,3)
                          .join(' · ') ||
                         'Question metadata'}
                      </span>

                      <small>
                        {checkingSimilar
                          ? 'Checking availability...'
                          : `${available} ${
                              available===1
                                ? 'similar question'
                                : 'similar questions'
                            } available`}
                      </small>
                    </div>

                    <label className="allocationSelect">
                      <span className="smallLabel">
                        Add to set
                      </span>

                      <select
                        value={amount}
                        disabled={
                          checkingSimilar ||
                          available===0
                        }
                        onChange={event=>
                          setSeedAllocation(
                            id,
                            Number(event.target.value)
                          )
                        }
                      >
                        {Array.from(
                          {length:available+1},
                          (_,value)=>value
                        ).map(value=>(
                          <option
                            key={value}
                            value={value}
                          >
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="allocationBottom">
              <div>
                <span className="smallLabel">
                  Total set size
                </span>

                <strong className="finalTotal">
                  {allocatedTotal}
                </strong>
              </div>

              <button
                type="button"
                className="primaryAction"
                disabled={
                  creating ||
                  checkingSimilar ||
                  allocatedTotal < 1
                }
                onClick={createSimilarSet}
              >
                {creating
                  ? 'Creating...'
                  : 'Create new practice set →'}
              </button>
            </div>
          </div>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  if(loggedIn===false){
    return (
      <main className="reviewQuestions">
        <div className="topbar">
          <Link href="/">
            ← Home
          </Link>
        </div>

        <header className="pageHeader">
          <span>Review</span>
          <h1>Turn marked work into your next practice</h1>
          <p>
            DOJO keeps the questions you flag and lets you
            return to them, review the solution and build
            fresh practice from similar questions.
          </p>
        </header>

        <section className="seedPanel">
          <div
            style={{
              display:'grid',
              gap:'10px'
            }}
          >
            <div className="seedRow">
              <input
                type="checkbox"
                checked
                readOnly
                aria-label="Example flagged question"
              />

              <div>
                <strong>Flag questions while you work</strong>
                <span>
                  Questions you want to revisit appear here
                  with their mark scheme and worked solution.
                </span>
              </div>
            </div>

            <div className="seedRow">
              <input
                type="checkbox"
                checked
                readOnly
                aria-label="Example similar practice"
              />

              <div>
                <strong>Practise similar</strong>
                <span>
                  Use one or more reviewed questions as seeds
                  for a fresh DOJO practice set.
                </span>
              </div>
            </div>
          </div>

          <div className="similarBar">
            <div>
              <strong>Your Review builds as you use DOJO</strong>
              <span>
                Create a free account to save flags, review
                questions and use them to create new practice.
              </span>
            </div>

            <div
              style={{
                display:'flex',
                gap:'10px',
                alignItems:'center',
                flexWrap:'wrap'
              }}
            >
              <Link
                href="/login?next=%2Freview%2Fquestions"
                style={{fontWeight:700,color:'#365441'}}
              >
                Log in
              </Link>

              <Link
                href="/signup?next=%2Freview%2Fquestions"
                className="primaryAction"
                style={{textDecoration:"none"}}
              >
                Create account →
              </Link>
            </div>
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

  if(stage==='finished'){
    const removeCount=
      questions.length-keepFlagged.size;
    return (
      <main className="reviewQuestions reviewFinished">
        <div className="topbar">
          <Link href="/review">
            &larr; Review
          </Link>

          <span>Review complete</span>
        </div>

        <section className="reviewFinishedCard">
          <span className="smallLabel">
            FLAGGED REVIEW COMPLETE
          </span>

          <h1>You've reached the end.</h1>

          <p>
            You reviewed {questions.length}{' '}
            {questions.length===1
              ? 'flagged question'
              : 'flagged questions'}.
          </p>

          <div className="reviewFinishedStats">
            <div>
              <strong>{questions.length}</strong>
              <span>reviewed</span>
            </div>

            <div>
              <strong>{selected.size}</strong>
              <span>selected for similar practice</span>
            </div>

            <div>
              <strong>{keepFlagged.size}</strong>
              <span>will stay flagged</span>
            </div>
          </div>

          <details className="reviewFinishedKeep">
            <summary>
              Keep some questions flagged
              {keepFlagged.size>0
                ? ` (${keepFlagged.size})`
                : ''}
            </summary>

            <p>
              Tick any questions you still want
              to keep in Review.
            </p>

            <div className="reviewFinishedQuestionList">
              {questions.map((item,i)=>{
                const itemId=questionId(item);

                return (
                  <label
                    key={itemId}
                    className="reviewFinishedQuestion"
                  >
                    <input
                      type="checkbox"
                      checked={
                        keepFlagged.has(itemId)
                      }
                      onChange={()=>
                        toggleKeepFlagged(itemId)
                      }
                    />

                    <span>
                      <strong>
                        {questionLabel(item,i)}
                      </strong>

                      <small>
                        {metadata(item)
                          .slice(0,4)
                          .join(' ? ') ||
                         'Flagged question'}
                      </small>
                    </span>
                  </label>
                );
              })}
            </div>
          </details>

          {error && (
            <div className="errorBox">
              {error}
            </div>
          )}

          <div className="reviewFinishedActions">
            <Link
              href="/review"
              className="reviewFinishedSecondary"
            >
              Back to Review
            </Link>

            {selected.size>0 && (
              <button
                type="button"
                className="primaryAction"
                onClick={openSimilarBuilder}
              >
                Practise similar &rarr;
              </button>
            )}

            <button
              type="button"
              className="primaryAction"
              disabled={finishBusy}
              onClick={finishAndRemoveFlags}
            >
              {finishBusy
                ? 'Updating Review...'
                : removeCount===questions.length
                  ? 'Remove all flags'
                  : removeCount===0
                    ? 'Keep all flags'
                    : `Remove ${removeCount} ${
                        removeCount===1
                          ? 'flag'
                          : 'flags'
                      }`
              }
            </button>
          </div>

          <p className="reviewFinishedNote">
            Choose what to keep flagged, or clear the set.
          </p>
        </section>

        <style jsx>{styles}</style>
      </main>
    );
  }

  const id=questionId(q);

  return (
    <main className="reviewQuestions reviewQuestionSession">
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

      <ReviewMarkingWorkspace
        q={q}
        index={index}
      />

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
          className={
            index>=questions.length-1
              ? 'finishQuestionsButton'
              : ''
          }
          onClick={()=>{
            if(index>=questions.length-1){
              setStage('finished');
              return;
            }

            setIndex(value=>
              Math.min(
                questions.length-1,
                value+1
              )
            );
          }}
        >
          {index>=questions.length-1
            ? 'Finish flagged questions'
            : 'Next \u2192'}
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

  /* Review marking workspace alignment */
  .reviewQuestions.reviewQuestionSession{
    max-width:1440px;
    padding-left:24px;
    padding-right:24px;
  }

  .reviewQuestionSession :global(.questionWorkspace){
    display:grid;
    grid-template-columns:minmax(0, 2fr) minmax(360px, 1fr);
    gap:46px;
    align-items:start;
    width:100%;
  }

  .reviewQuestionSession :global(.questionColumn){
    min-width:0;
  }

  .reviewQuestionSession :global(.questionPaper){
    min-height:410px;
  }

  .reviewQuestionSession :global(.markingReferenceColumn){
    min-width:0;
  }

  .reviewQuestionSession :global(.markingSenseiCompactMode){
    min-height:0;
    height:auto;
    overflow:hidden;
    border:1px solid #1d2721;
    border-radius:12px;
    background:#09100c;
    color:#fff;
  }

  .reviewQuestionSession :global(.markingSenseiCompactMode .dojoColumnHeading){
    border-bottom:1px solid rgba(255,255,255,.14);
    color:#fff;
  }

  .reviewQuestionSession :global(.markingSenseiCompactMode .askDojo){
    background:#09100c;
    color:#fff;
  }

  .reviewQuestionSession :global(.markingSenseiCompactMode input),
  .reviewQuestionSession :global(.markingSenseiCompactMode textarea){
    border-color:#35423b;
    background:#111a15;
    color:#fff;
  }

  .reviewQuestionSession :global(.markingSenseiCompactMode input::placeholder),
  .reviewQuestionSession :global(.markingSenseiCompactMode textarea::placeholder){
    color:#89948d;
  }

  @media(max-width:900px){
    .reviewQuestionSession :global(.questionWorkspace){
      grid-template-columns:1fr;
      gap:20px;
    }
  }


  .reviewQuestionSession{
    max-width:1500px;
  }


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

  .questionActions .finishQuestionsButton{
    border-color:#124fad;
    background:#124fad;
    color:#fff;
  }

  .reviewFinished{
    max-width:900px;
  }

  .reviewFinishedCard{
    margin-top:46px;
    padding:38px;
    border:1px solid rgba(22,33,26,.12);
    border-radius:16px;
    background:#fff;
  }

  .reviewFinishedCard h1{
    margin:8px 0;
    font-size:34px;
    letter-spacing:-.035em;
  }

  .reviewFinishedCard > p{
    color:#69736c;
    line-height:1.6;
  }

  .reviewFinishedStats{
    display:grid;
    grid-template-columns:repeat(3,1fr);
    gap:10px;
    margin:28px 0;
  }

  .reviewFinishedStats > div{
    padding:18px;
    border:1px solid rgba(22,33,26,.1);
    border-radius:10px;
    background:#f6f8f6;
  }

  .reviewFinishedStats strong,
  .reviewFinishedStats span{
    display:block;
  }

  .reviewFinishedStats strong{
    font-size:24px;
  }

  .reviewFinishedStats span{
    margin-top:4px;
    color:#707a73;
    font-size:11px;
    font-weight:700;
  }

  .reviewFinishedKeep{
    margin:4px 0 24px;
    border-top:1px solid rgba(22,33,26,.1);
    border-bottom:1px solid rgba(22,33,26,.1);
  }

  .reviewFinishedKeep summary{
    padding:16px 2px;
    cursor:pointer;
    font-size:12px;
    font-weight:800;
  }

  .reviewFinishedKeep > p{
    margin:0 0 12px;
    color:#707a73;
    font-size:11px;
  }

  .reviewFinishedQuestionList{
    display:grid;
    gap:7px;
    padding-bottom:16px;
  }

  .reviewFinishedQuestion{
    display:flex;
    align-items:flex-start;
    gap:10px;
    padding:11px 12px;
    border:1px solid rgba(22,33,26,.09);
    border-radius:8px;
    background:#f8faf8;
    cursor:pointer;
  }

  .reviewFinishedQuestion span,
  .reviewFinishedQuestion strong,
  .reviewFinishedQuestion small{
    display:block;
  }

  .reviewFinishedQuestion strong{
    font-size:12px;
  }

  .reviewFinishedQuestion small{
    margin-top:3px;
    color:#747e77;
    font-size:10px;
  }

  .reviewFinishedActions{
    display:flex;
    align-items:center;
    gap:10px;
    flex-wrap:wrap;
  }

  .reviewFinishedSecondary{
    border:1px solid rgba(22,33,26,.14);
    border-radius:9px;
    padding:10px 14px;
    color:#18221b;
    text-decoration:none;
    font-size:12px;
    font-weight:800;
  }

  .reviewFinishedNote{
    margin-top:18px;
    font-size:11px;
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

  .allocationBuilder{
    margin-top:24px;
    padding-top:20px;
    border-top:1px solid rgba(22,33,26,.09);
  }

  .allocationTop,
  .allocationBottom{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
  }

  .compositionTotal,
  .finalTotal{
    display:block;
    margin-top:5px;
  }

  .compositionTotal{
    font-size:15px;
  }

  .finalTotal{
    font-size:24px;
  }

  .balanceButton{
    border:1px solid rgba(22,33,26,.18);
    border-radius:8px;
    background:#fff;
    padding:9px 12px;
    cursor:pointer;
    font:inherit;
    font-size:11px;
    font-weight:800;
  }

  .allocationList{
    display:grid;
    gap:8px;
    margin:18px 0;
  }

  .allocationRow{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
    padding:13px 14px;
    border:1px solid rgba(22,33,26,.09);
    border-radius:10px;
    background:#fff;
  }

  .allocationQuestion strong,
  .allocationQuestion span,
  .allocationQuestion small{
    display:block;
  }

  .allocationQuestion strong{
    font-size:12px;
  }

  .allocationQuestion span{
    margin-top:3px;
    color:#747e77;
    font-size:10px;
  }

  .allocationQuestion small{
    margin-top:6px;
    color:#486151;
    font-size:11px;
    font-weight:700;
  }

  .allocationSelect{
    display:grid;
    gap:5px;
    min-width:90px;
  }

  .allocationSelect select{
    min-height:36px;
    border:1px solid #d7dcd8;
    border-radius:8px;
    background:#fff;
    padding:0 9px;
  }

  .allocationBottom{
    padding-top:18px;
    border-top:1px solid rgba(22,33,26,.09);
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

  .allocationBuilder{
    margin-top:24px;
    padding-top:20px;
    border-top:1px solid rgba(22,33,26,.09);
  }

  .allocationTop,
  .allocationBottom{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
  }

  .compositionTotal,
  .finalTotal{
    display:block;
    margin-top:5px;
  }

  .compositionTotal{
    font-size:15px;
  }

  .finalTotal{
    font-size:24px;
  }

  .balanceButton{
    border:1px solid rgba(22,33,26,.18);
    border-radius:8px;
    background:#fff;
    padding:9px 12px;
    cursor:pointer;
    font:inherit;
    font-size:11px;
    font-weight:800;
  }

  .allocationList{
    display:grid;
    gap:8px;
    margin:18px 0;
  }

  .allocationRow{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
    padding:13px 14px;
    border:1px solid rgba(22,33,26,.09);
    border-radius:10px;
    background:#fff;
  }

  .allocationQuestion strong,
  .allocationQuestion span,
  .allocationQuestion small{
    display:block;
  }

  .allocationQuestion strong{
    font-size:12px;
  }

  .allocationQuestion span{
    margin-top:3px;
    color:#747e77;
    font-size:10px;
  }

  .allocationQuestion small{
    margin-top:6px;
    color:#486151;
    font-size:11px;
    font-weight:700;
  }

  .allocationSelect{
    display:grid;
    gap:5px;
    min-width:90px;
  }

  .allocationSelect select{
    min-height:36px;
    border:1px solid #d7dcd8;
    border-radius:8px;
    background:#fff;
    padding:0 9px;
  }

  .allocationBottom{
    padding-top:18px;
    border-top:1px solid rgba(22,33,26,.09);
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

export default function ReviewQuestionsPage(){
  return (
    <Suspense fallback={
      <main>
        <p>Loading questions...</p>
      </main>
    }>
      <ReviewQuestionsContent />
    </Suspense>
  );
}
