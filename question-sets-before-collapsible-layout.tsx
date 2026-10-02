'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { selectQuestionsWithExposure } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  TOPIC_AREAS,
  focusGroups,
  practiceCategory
} from '../../lib/topics';

type Exposure =
  | 'any'
  | 'unseen'
  | 'once'
  | 'few'
  | 'explored';

type Selection = {
  id:string;
  label:string;
  scopes:string[];
  topic:string;
};

const exposureChoices:{
  id:Exposure;
  label:string;
  detail:string;
}[]=[
  {
    id:'any',
    label:'Any',
    detail:'Use the full selected range'
  },
  {
    id:'unseen',
    label:'Unseen',
    detail:'Exact questions you have not marked before'
  },
  {
    id:'once',
    label:'Seen once',
    detail:'Exact questions you have marked once'
  },
  {
    id:'few',
    label:'Seen a few times',
    detail:'Exact questions you have marked 2–3 times'
  },
  {
    id:'explored',
    label:'Well explored',
    detail:'Exact questions you have marked 4+ times'
  }
];

function validExposure(value:string):value is Exposure{
  return [
    'any',
    'unseen',
    'once',
    'few',
    'explored'
  ].includes(value);
}

function topicSelection(
  area:string,
  slug:string,
  label:string
):Selection{
  return {
    id:`topic:${area}:${slug}`,
    label,
    topic:label,
    scopes:[`topic:${label}`]
  };
}

function focusSelection(
  area:string,
  slug:string,
  topic:string,
  label:string,
  skills:string[]
):Selection{
  const scopes:string[]=[];

  for(const skill of skills){
    const category=practiceCategory(skill);

    if(category){
      for(const scope of category.any){
        if(!scopes.includes(scope)){
          scopes.push(scope);
        }
      }
    }
  }

  /*
   * A focus group without a PRACTICE_CATEGORIES mapping should
   * still behave safely: use its parent topic rather than creating
   * a selector the backend cannot understand.
   */
  if(!scopes.length){
    scopes.push(`topic:${topic}`);
  }

  return {
    id:`focus:${area}:${slug}:${label}`,
    label,
    topic,
    scopes
  };
}

function QuestionSetsContent(){
  const searchParams=useSearchParams();
  const router=useRouter();

  const incomingExposure=useMemo<Exposure[]>(()=>{
    const raw=searchParams.get('exposure');

    if(!raw) return ['any'];

    const values=raw
      .split(',')
      .map(value=>value.trim())
      .filter(validExposure);

    return values.length ? values : ['any'];
  },[searchParams]);

  const cameFromCoverage=
    searchParams.get('source')==='coverage';

  const [selected,setSelected]=
    useState<Record<string,Selection>>({});

  const [expanded,setExpanded]=
    useState<Set<string>>(new Set());

  const [exposures,setExposures]=
    useState<Exposure[]>(incomingExposure);

  const [setCount,setSetCount]=useState(10);
  const [starting,setStarting]=useState(false);
  const [startError,setStartError]=useState('');

  const selectedItems=Object.values(selected);

  const selectedScopes=useMemo(()=>{
    const result:string[]=[];

    for(const item of selectedItems){
      for(const scope of item.scopes){
        if(!result.includes(scope)){
          result.push(scope);
        }
      }
    }

    return result;
  },[selectedItems]);

  function toggleExpanded(key:string){
    setExpanded(current=>{
      const next=new Set(current);

      if(next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }

  function toggleSelection(item:Selection){
    setSelected(current=>{
      const next={...current};

      if(next[item.id]){
        delete next[item.id];
      }else{
        /*
         * Whole-topic and focus selections for the same topic
         * are mutually exclusive. A topic means "all of it";
         * focus selections mean specific branches.
         */
        if(item.id.startsWith('topic:')){
          for(const key of Object.keys(next)){
            if(
              next[key].topic===item.topic &&
              key.startsWith('focus:')
            ){
              delete next[key];
            }
          }
        }else{
          for(const key of Object.keys(next)){
            if(
              next[key].topic===item.topic &&
              key.startsWith('topic:')
            ){
              delete next[key];
            }
          }
        }

        next[item.id]=item;
      }

      return next;
    });
  }

  function toggleExposure(exposure:Exposure){
    if(exposure==='any'){
      setExposures(['any']);
      return;
    }

    setExposures(current=>{
      const withoutAny=current.filter(
        item=>item!=='any'
      );

      if(withoutAny.includes(exposure)){
        const next=withoutAny.filter(
          item=>item!==exposure
        );

        return next.length ? next : ['any'];
      }

      return [...withoutAny,exposure];
    });
  }

  const canStart=selectedScopes.length>0;

  async function buildHistory(){
    const history:Record<string,number>={};

    const {data:auth}=await supabase.auth.getUser();

    if(!auth.user) return history;

    const {data,error}=await supabase
      .from('work_items')
      .select(`
        id,
        work_questions (
          question_id,
          marked_at
        )
      `);

    if(error) throw error;

    for(const item of data ?? []){
      for(const question of item.work_questions ?? []){
        if(!question.marked_at) continue;

        history[question.question_id]=
          (history[question.question_id] ?? 0)+1;
      }
    }

    return history;
  }

  async function startQuestionSet(){
    if(!canStart || starting) return;

    setStarting(true);
    setStartError('');

    try{
      /*
       * Use the exposure selector even for "Any". It ultimately
       * calls the same /questions/select endpoint and means the
       * browser receives the exact IDs selected by the backend.
       */
      const history=
        exposures.includes('any')
          ? {}
          : await buildHistory();

      const result=await selectQuestionsWithExposure(
        selectedScopes,
        setCount,
        exposures,
        history
      );

      const ids=(result?.questions ?? [])
        .map((question:any)=>question.id)
        .filter(Boolean);

      if(!ids.length){
        throw new Error(
          'No questions match that selection yet.'
        );
      }

      const title=selectedItems
        .map(item=>item.label)
        .join(' + ');

      router.push(
        `/practice?topic=${encodeURIComponent(
          title || 'Question Set'
        )}` +
        `&count=${setCount}` +
        `&mode=practice` +
        `&ask=1` +
        `&solutions=1` +
        `&freeNav=1` +
        `&ids=${encodeURIComponent(ids.join(','))}`
      );
    }catch(error:any){
      setStartError(
        error?.message ||
        'Could not build this question set.'
      );
    }finally{
      setStarting(false);
    }
  }

  return (
    <main className="questionSetsV2Page">
      <header className="questionSetsV2Header">
        <div className="page-kicker">
          A-level Mathematics
        </div>

        <h1>Question Sets</h1>

        <p>
          Choose anything from the course and combine it
          into one practice set.
        </p>
      </header>

      {cameFromCoverage && (
        <section className="coverageImportCard">
          <div>
            <span className="questionSetMiniLabel">
              From Coverage
            </span>

            <h2>Build your next set.</h2>

            <p>
              Choose the exact areas you want to practise,
              then adjust question history and set size.
            </p>
          </div>
        </section>
      )}

      <section className="questionSetConfig">
        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">01</span>

            <div>
              <h2>Choose what to practise</h2>
              <p>
                Select whole topics, or open a topic and
                choose more specific areas.
              </p>
            </div>
          </div>

          <div style={{
            display:'grid',
            gap:'24px'
          }}>
            {Object.entries(TOPIC_AREAS).map(
              ([areaKey,area])=>(
                <section
                  key={areaKey}
                  style={{
                    border:'1px solid #ddd',
                    borderRadius:'10px',
                    padding:'18px'
                  }}
                >
                  <div style={{
                    marginBottom:'14px'
                  }}>
                    <h3 style={{
                      margin:'0 0 4px'
                    }}>
                      {area.label}
                    </h3>

                    <p style={{
                      margin:0,
                      color:'#666',
                      fontSize:'14px'
                    }}>
                      {area.description}
                    </p>
                  </div>

                  <div style={{
                    display:'grid',
                    gap:'10px'
                  }}>
                    {area.topics.map(
                      ([slug,topicLabel])=>{
                        const key=
                          `${areaKey}:${slug}`;

                        const topicItem=
                          topicSelection(
                            areaKey,
                            slug,
                            topicLabel
                          );

                        const topicSelected=
                          !!selected[topicItem.id];

                        const groups=
                          focusGroups(slug);

                        const isExpanded=
                          expanded.has(key);

                        return (
                          <div
                            key={slug}
                            style={{
                              border:'1px solid #e5e5e5',
                              borderRadius:'8px',
                              overflow:'hidden'
                            }}
                          >
                            <div style={{
                              display:'flex',
                              gap:'10px',
                              alignItems:'stretch'
                            }}>
                              <button
                                type="button"
                                className={
                                  topicSelected
                                    ? 'active'
                                    : ''
                                }
                                onClick={()=>
                                  toggleSelection(topicItem)
                                }
                                style={{
                                  flex:1,
                                  minHeight:'48px',
                                  textAlign:'left',
                                  padding:'10px 14px'
                                }}
                              >
                                <span className="questionSetCheckbox">
                                  {topicSelected ? '✓' : ''}
                                </span>

                                <strong>
                                  {topicLabel}
                                </strong>
                              </button>

                              {groups.length>0 && (
                                <button
                                  type="button"
                                  onClick={()=>
                                    toggleExpanded(key)
                                  }
                                  aria-label={
                                    isExpanded
                                      ? `Close ${topicLabel}`
                                      : `Open ${topicLabel}`
                                  }
                                  style={{
                                    width:'48px',
                                    border:0,
                                    borderLeft:
                                      '1px solid #e5e5e5',
                                    background:'#fff',
                                    cursor:'pointer',
                                    fontSize:'18px'
                                  }}
                                >
                                  {isExpanded ? '−' : '+'}
                                </button>
                              )}
                            </div>

                            {isExpanded && groups.length>0 && (
                              <div style={{
                                padding:'10px',
                                display:'grid',
                                gap:'8px',
                                background:'#fafafa'
                              }}>
                                {groups.map(group=>{
                                  const item=
                                    focusSelection(
                                      areaKey,
                                      slug,
                                      topicLabel,
                                      group.label,
                                      group.skills
                                    );

                                  const active=
                                    !!selected[item.id];

                                  return (
                                    <button
                                      type="button"
                                      key={group.label}
                                      className={
                                        active
                                          ? 'active'
                                          : ''
                                      }
                                      onClick={()=>
                                        toggleSelection(item)
                                      }
                                      style={{
                                        textAlign:'left',
                                        padding:'10px 12px'
                                      }}
                                    >
                                      <span className="questionSetCheckbox">
                                        {active ? '✓' : ''}
                                      </span>

                                      <span>
                                        <strong>
                                          {group.label}
                                        </strong>

                                        {group.description && (
                                          <small style={{
                                            display:'block',
                                            marginTop:'3px'
                                          }}>
                                            {group.description}
                                          </small>
                                        )}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>
              )
            )}
          </div>
        </div>

        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">02</span>

            <div>
              <h2>Choose question history</h2>
              <p>
                Control how many times you have previously
                marked the exact questions included.
              </p>
            </div>
          </div>

          <div className="questionSetExposureGrid">
            {exposureChoices.map(choice=>{
              const active=
                exposures.includes(choice.id);

              return (
                <button
                  type="button"
                  key={choice.id}
                  className={active ? 'active' : ''}
                  onClick={()=>
                    toggleExposure(choice.id)
                  }
                >
                  <span
                    className={
                      `questionSetExposureDot ${choice.id}`
                    }
                  />

                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className=
          "questionSetSection questionSetFinalSection"
        >
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">03</span>

            <div>
              <h2>Set size</h2>
              <p>
                Choose the maximum number of questions.
              </p>
            </div>
          </div>

          <div className="questionSetCountRow">
            {[5,10,15,20].map(count=>(
              <button
                type="button"
                key={count}
                className={
                  setCount===count ? 'active' : ''
                }
                onClick={()=>
                  setSetCount(count)
                }
              >
                {count}
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="questionSetLaunchBar">
        <div>
          <span className="questionSetMiniLabel">
            Your set
          </span>

          <strong>
            {selectedItems.length
              ? `${setCount} questions · ${
                  selectedItems
                    .map(item=>item.label)
                    .join(', ')
                }`
              : 'Choose at least one area'}
          </strong>

          {selectedItems.length>0 && (
            <small>
              {exposures.includes('any')
                ? 'Any question history'
                : exposureChoices
                    .filter(choice=>
                      exposures.includes(choice.id)
                    )
                    .map(choice=>choice.label)
                    .join(' · ')}
            </small>
          )}
        </div>

        <div>
          <button
            type="button"
            disabled={!canStart || starting}
            className={
              `questionSetStartButton ${
                !canStart ? 'disabled' : ''
              }`
            }
            onClick={startQuestionSet}
          >
            {starting
              ? 'Building set…'
              : 'Start question set →'}
          </button>

          {startError && (
            <small className="questionSetStartError">
              {startError}
            </small>
          )}
        </div>
      </aside>
    </main>
  );
}

export default function QuestionSetsPage(){
  return (
    <Suspense
      fallback={
        <main className="questionSetsV2Page">
          <header className="questionSetsV2Header">
            <div className="page-kicker">
              A-level Mathematics
            </div>

            <h1>Question Sets</h1>
            <p>Loading your question set...</p>
          </header>
        </main>
      }
    >
      <QuestionSetsContent />
    </Suspense>
  );
}