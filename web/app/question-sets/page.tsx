'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { selectBalancedQuestionPools } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import {
  consumeTrialEntitlement,
  releaseTrialEntitlement
} from '../../lib/entitlements';
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
  within?:string;
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
    scopes:[`topic:${label}`],
    within:undefined
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
  let within=`topic:${topic}`;

  for(const skill of skills){
    const category=practiceCategory(skill);

    if(category){
      within=category.within || within;

      for(const scope of category.any){
        if(!scopes.includes(scope)){
          scopes.push(scope);
        }
      }
    }
  }

  /*
   * A focus selection is ONE pool:
   *
   *   within parent topic
   *   AND
   *   any of its family / technique / architecture scopes.
   *
   * It must not become several independently weighted pools.
   */
  return {
    id:`focus:${area}:${slug}:${label}`,
    label,
    topic,
    scopes,
    within
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

  const [expandedAreas,setExpandedAreas]=
    useState<Set<string>>(new Set());

  const [expanded,setExpanded]=
    useState<Set<string>>(new Set());

  const [exposures,setExposures]=
    useState<Exposure[]>(incomingExposure);

  const [setCount,setSetCount]=useState(10);
  const [workspaceMode,setWorkspaceMode]=
    useState<'practice'|'exam'>('practice');
  const [askDojo,setAskDojo]=useState(true);
  const [solutions,setSolutions]=useState(true);
  const [timer,setTimer]=useState(false);
  const [freeNav,setFreeNav]=useState(true);
  const [starting,setStarting]=useState(false);
  const [startError,setStartError]=useState('');
  const [membershipRequired,setMembershipRequired]=
    useState(false);
  const [loggedIn,setLoggedIn]=useState<boolean|null>(null);

  useEffect(()=>{
    let cancelled=false;

    supabase.auth.getUser()
      .then(({data})=>{
        if(!cancelled){
          setLoggedIn(!!data.user);
        }
      })
      .catch(()=>{
        if(!cancelled){
          setLoggedIn(false);
        }
      });

    return ()=>{
      cancelled=true;
    };
  },[]);

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

  function toggleArea(area:string){
    setExpandedAreas(current=>{
      const next=new Set(current);

      if(next.has(area)) next.delete(area);
      else next.add(area);

      return next;
    });
  }

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

  const canStart=selectedItems.length>0;

  const isAdvancedQuestionSet=
    loggedIn===true &&
    (
      workspaceMode==='exam' ||
      !exposures.includes('any')
    );

  async function buildHistory(){
    const history:Record<string,number>={};

    const {data:auth,error:authError}=
      await supabase.auth.getUser();

    if(authError) throw authError;
    if(!auth.user) return history;

    const {
      data:markedHistory,
      error:historyError
    } = await supabase.rpc(
      'get_marked_question_history'
    );

    if(historyError) throw historyError;

    for(const row of markedHistory ?? []){
      const id=String(
        row?.question_id ?? ''
      );

      if(!id) continue;

      history[id]=Number(
        row?.marked_attempts ?? 0
      );
    }

    return history;
  }

  async function startQuestionSet(){
    if(!canStart || starting) return;

    setStarting(true);
    setStartError('');
    setMembershipRequired(false);

    let entitlementKey:string|null=null;
    let entitlementConsumed=false;

    if(isAdvancedQuestionSet){
      entitlementKey=
        typeof crypto!=='undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `question-set-${Date.now()}-${Math.random()
              .toString(36)
              .slice(2)}`;
    }

    try{
      /*
       * Use the exposure selector even for "Any". It ultimately
       * calls the same /questions/select endpoint and means the
       * browser receives the exact IDs selected by the backend.
       */
      const effectiveExposures:Exposure[]=
        loggedIn===false ? ['any'] : exposures;

      const history=
        effectiveExposures.includes('any')
          ? {}
          : await buildHistory();

      const pools=selectedItems.map(item=>({
        label:item.label,
        within:item.within,
        any:item.scopes
      }));

      const result=await selectBalancedQuestionPools(
        pools,
        setCount,
        effectiveExposures,
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

      if(isAdvancedQuestionSet){
        if(!entitlementKey){
          throw new Error(
            'DOJO could not prepare this trial question set.'
          );
        }

        const entitlement=
          await consumeTrialEntitlement(
            'advanced_question_set',
            entitlementKey
          );

        if(!entitlement.allowed){
          setMembershipRequired(true);
          throw new Error(
            `You've used your ${entitlement.allowance} advanced question set trial uses. Basic question sets are still available.`
          );
        }

        entitlementConsumed=entitlement.consumed;
      }

      const title=selectedItems
        .map(item=>item.label)
        .join(' + ');

      router.push(
        `/practice?topic=${encodeURIComponent(
          title || 'Question Set'
        )}` +
        `&count=${setCount}` +
        `&mode=${loggedIn===false ? 'practice' : workspaceMode}` +
        `&ask=${loggedIn===false ? '0' : askDojo ? '1' : '0'}` +
        `&solutions=${solutions ? '1' : '0'}` +
        `&timer=${loggedIn===false ? '0' : timer ? '1' : '0'}` +
        `&freeNav=${freeNav ? '1' : '0'}` +
        `&ids=${encodeURIComponent(ids.join(','))}`
      );
      entitlementConsumed=false;
    }catch(error:any){
      if(entitlementConsumed && entitlementKey){
        try{
          await releaseTrialEntitlement(
            'advanced_question_set',
            entitlementKey
          );
        }catch(releaseError){
          console.error(
            'Could not release Question Set trial use:',
            releaseError
          );
        }
      }

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
                Open a course area, then a topic. Select the
                whole topic or choose specific focus areas.
              </p>
            </div>
          </div>

          <div
            style={{
              display:'grid',
              gridTemplateColumns:
                'repeat(3, minmax(0, 1fr))',
              gap:'14px',
              alignItems:'start'
            }}
          >
            {Object.entries(TOPIC_AREAS).map(
              ([areaKey,area])=>{
                const areaOpen=
                  expandedAreas.has(areaKey);

                return (
                  <section
                    key={areaKey}
                    style={{
                      border:'1px solid #ddd',
                      borderRadius:'10px',
                      overflow:'hidden',
                      minWidth:0
                    }}
                  >
                    <button
                      type="button"
                      onClick={()=>
                        toggleArea(areaKey)
                      }
                      style={{
                        width:'100%',
                        display:'flex',
                        justifyContent:'space-between',
                        alignItems:'center',
                        gap:'12px',
                        padding:'16px',
                        textAlign:'left',
                        border:0,
                        background:'#fff',
                        cursor:'pointer'
                      }}
                    >
                      <span>
                        <strong
                          style={{
                            display:'block',
                            fontSize:'17px'
                          }}
                        >
                          {area.label}
                        </strong>

                        <small
                          style={{
                            display:'block',
                            marginTop:'4px',
                            color:'#666'
                          }}
                        >
                          {area.description}
                        </small>
                      </span>

                      <span
                        style={{
                          fontSize:'20px',
                          flex:'0 0 auto'
                        }}
                      >
                        {areaOpen ? '−' : '+'}
                      </span>
                    </button>

                    {areaOpen && (
                      <div
                        style={{
                          display:'grid',
                          gap:'8px',
                          padding:'0 10px 10px'
                        }}
                      >
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
                                  border:
                                    '1px solid #e5e5e5',
                                  borderRadius:'8px',
                                  overflow:'hidden'
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={()=>
                                    toggleExpanded(key)
                                  }
                                  style={{
                                    width:'100%',
                                    display:'flex',
                                    justifyContent:
                                      'space-between',
                                    alignItems:'center',
                                    gap:'10px',
                                    padding:'11px 12px',
                                    border:0,
                                    background:'#fff',
                                    textAlign:'left',
                                    cursor:'pointer'
                                  }}
                                >
                                  <strong>
                                    {topicLabel}
                                  </strong>

                                  <span
                                    style={{
                                      fontSize:'18px'
                                    }}
                                  >
                                    {isExpanded
                                      ? '−'
                                      : '+'}
                                  </span>
                                </button>

                                {isExpanded && (
                                  <div
                                    style={{
                                      padding:'8px',
                                      display:'grid',
                                      gap:'7px',
                                      background:'#fafafa'
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className={
                                        topicSelected
                                          ? 'active'
                                          : ''
                                      }
                                      onClick={()=>
                                        toggleSelection(
                                          topicItem
                                        )
                                      }
                                      style={{
                                        textAlign:'left',
                                        padding:'10px 11px'
                                      }}
                                    >
                                      <span className=
                                        "questionSetCheckbox"
                                      >
                                        {topicSelected
                                          ? '✓'
                                          : ''}
                                      </span>

                                      <strong>
                                        Select all of{' '}
                                        {topicLabel}
                                      </strong>
                                    </button>

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
                                            toggleSelection(
                                              item
                                            )
                                          }
                                          style={{
                                            textAlign:'left',
                                            padding:
                                              '10px 11px'
                                          }}
                                        >
                                          <span className=
                                            "questionSetCheckbox"
                                          >
                                            {active
                                              ? '✓'
                                              : ''}
                                          </span>

                                          <span>
                                            <strong>
                                              {group.label}
                                            </strong>

                                            {group.description && (
                                              <small
                                                style={{
                                                  display:
                                                    'block',
                                                  marginTop:
                                                    '3px'
                                                }}
                                              >
                                                {
                                                  group.description
                                                }
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
                    )}
                  </section>
                );
              }
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

          {loggedIn===false && (
            <div
              style={{
                margin:'0 0 14px',
                padding:'13px 14px',
                border:'1px solid #dfe5e1',
                borderRadius:'9px',
                background:'#f7f9f7',
                fontSize:'12px',
                lineHeight:1.5
              }}
            >
              <strong style={{display:'block',marginBottom:'3px'}}>
                Personalise sets using your history
              </strong>

              <span style={{color:'#69716c'}}>
                A Trial account lets DOJO build sets from questions
                you have not seen, seen once, or already explored.
              </span>

              <div style={{marginTop:'8px'}}>
                <Link
                  href="/signup?next=%2Fquestion-sets"
                  style={{fontWeight:700,color:'inherit'}}
                >
                  Create Trial account →
                </Link>
              </div>
            </div>
          )}

          <div className="questionSetExposureGrid">
            {exposureChoices.map(choice=>{
              const active=
                exposures.includes(choice.id);

              return (
                <button
                  type="button"
                  disabled={loggedIn===false && choice.id!=='any'}
                  key={choice.id}
                  className={active ? 'active' : ''}
                  onClick={()=>
                    loggedIn===false
                      ? setExposures(['any'])
                      : toggleExposure(choice.id)
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

      <section
        className="questionSetConfig"
        style={{marginTop:'18px'}}
      >
        <div className="questionSetSection">
          <div className="questionSetSectionHeading">
            <span className="questionSetStep">04</span>

            <div>
              <h2>Workspace</h2>
              <p>
                Choose how you want to work through this set.
              </p>
            </div>
          </div>

          {loggedIn===false && (
            <div
              style={{
                margin:'0 0 16px',
                padding:'13px 14px',
                border:'1px solid #dfe5e1',
                borderRadius:'9px',
                background:'#f7f9f7',
                fontSize:'12px',
                lineHeight:1.5
              }}
            >
              <strong style={{display:'block',marginBottom:'3px'}}>
                More ways to work
              </strong>

              <span style={{color:'#69716c'}}>
                Create a Trial account to use Exam mode, Ask DOJO
                and the personalised workspace options.
              </span>

              <div style={{marginTop:'8px'}}>
                <Link
                  href="/signup?next=%2Fquestion-sets"
                  style={{fontWeight:700,color:'inherit'}}
                >
                  Create Trial account →
                </Link>
              </div>
            </div>
          )}

          <div
            className="questionSetCountRow"
            style={{marginBottom:'18px'}}
          >
            <button
              type="button"
              className={
                workspaceMode==='practice'
                  ? 'active'
                  : ''
              }
              onClick={()=>
                setWorkspaceMode('practice')
              }
            >
              Practice mode
            </button>

            <button
              type="button"
              disabled={loggedIn===false}
              className={
                workspaceMode==='exam'
                  ? 'active'
                  : ''
              }
              onClick={()=>
                loggedIn!==false && setWorkspaceMode('exam')
              }
            >
              Exam mode
            </button>
          </div>

          {workspaceMode==='practice' ? (
            <>
              <div
                style={{
                  fontWeight:600,
                  marginBottom:'10px'
                }}
              >
                Advanced options
              </div>

              <div className="questionSetCountRow">
                <button
                  type="button"
                  className={askDojo ? 'active' : ''}
                  disabled={loggedIn===false}
                  onClick={()=>setAskDojo(v=>!v)}
                >
                  Ask DOJO: {askDojo ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  className={solutions ? 'active' : ''}
                  disabled={loggedIn===false}
                  onClick={()=>setSolutions(v=>!v)}
                >
                  Solutions: {solutions ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  className={timer ? 'active' : ''}
                  disabled={loggedIn===false}
                  onClick={()=>setTimer(v=>!v)}
                >
                  Timer: {timer ? 'On' : 'Off'}
                </button>

                <button
                  type="button"
                  className={freeNav ? 'active' : ''}
                  disabled={loggedIn===false}
                  onClick={()=>setFreeNav(v=>!v)}
                >
                  Free navigation: {freeNav ? 'On' : 'Off'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p style={{margin:'0 0 12px'}}>
                The whole set will appear as one continuous
                exam document. Help and solutions stay hidden
                while you are sitting it.
              </p>

              <div className="questionSetCountRow">
                <button
                  type="button"
                  className={timer ? 'active' : ''}
                  onClick={()=>setTimer(v=>!v)}
                >
                  Timer: {timer ? 'On' : 'Off'}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
      <aside className="questionSetLaunchBar">
        <div>
          <span className="questionSetMiniLabel">
            Your set
          </span>

          {loggedIn===false && (
            <small style={{display:'block',marginTop:'3px'}}>
              Basic set · not saved to your account
            </small>
          )}

          {loggedIn===true && (
            <small style={{display:'block',marginTop:'3px'}}>
              {isAdvancedQuestionSet
                ? 'Advanced set · uses a trial generation'
                : 'Basic set'}
            </small>
          )}

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
          {membershipRequired && (
            <p style={{marginTop:'10px'}}>
              <Link href="/account">
                View membership →
              </Link>
            </p>
          )}
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
