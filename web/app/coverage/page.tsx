'use client';

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';

import {getCoverageCatalogue} from '../../lib/api';
import {supabase} from '../../lib/supabase';

type ArchitectureRow={
  topic:string;
  architecture:string;
  family?:string;
  question_ids:string[];
  question_count:number;
};

type CoverageCatalogue={
  architectures:ArchitectureRow[];
  architecture_count:number;
  question_count:number;
};

type AttemptMap=Record<string,number>;
function pct(part:number,total:number){
  if(!total) return 0;
  return Math.round((part/total)*100);
}

function readableArchitecture(value:string){
  return value
    .replace(/_/g,' ')
    .replace(/\b\w/g,char=>char.toUpperCase());
}

export default function CoveragePage(){
  const [catalogue,setCatalogue]=
    useState<CoverageCatalogue|null>(null);

  const [attempts,setAttempts]=
    useState<AttemptMap>({});

  const [expanded,setExpanded]=
    useState<Set<string>>(()=>new Set());

  const [selectedArchitectures,setSelectedArchitectures]=
    useState<Set<string>>(()=>new Set());

  const [architectureSetCount,setArchitectureSetCount]=
    useState(10);

  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [loggedIn,setLoggedIn]=
    useState<boolean|null>(null);

  useEffect(()=>{
    let cancelled=false;

    async function load(){
      try{
        setLoading(true);
        setError('');

        const bank=await getCoverageCatalogue();

        const {data:auth,error:authError}=
          await supabase.auth.getUser();

        if(authError && authError.name!=='AuthSessionMissingError'){
          throw authError;
        }

        if(cancelled) return;
        setLoggedIn(Boolean(auth.user));

        const history:AttemptMap={};

        if(auth.user){
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
        }

        if(cancelled) return;

        setCatalogue(bank);
        setAttempts(history);
      }catch(err:any){
        if(cancelled) return;

        console.error(err);

        setError(
          err?.message ||
          'Could not load coverage.'
        );
      }finally{
        if(!cancelled) setLoading(false);
      }
    }

    load();

    return ()=>{
      cancelled=true;
    };
  },[]);


  const rows=useMemo(()=>{
    return (catalogue?.architectures ?? []).map(row=>{
      const markedAttempts=row.question_ids.reduce(
        (total,id)=>total+(attempts[id]||0),
        0
      );

      const markedQuestions=row.question_ids.reduce(
        (total,id)=>total+(attempts[id]>0 ? 1 : 0),
        0
      );

      return {
        ...row,
        markedAttempts,
        markedQuestions,
        encountered:markedAttempts>0
      };
    });
  },[catalogue,attempts]);


  const topics=useMemo(()=>{
    const map=new Map<string,typeof rows>();

    for(const row of rows){
      const current=map.get(row.topic) ?? [];
      current.push(row);
      map.set(row.topic,current);
    }

    return [...map.entries()]
      .map(([name,architectures])=>({
        name,
        architectures,
        total:architectures.length,
        encountered:architectures.filter(
          a=>a.encountered
        ).length,
        questionCount:architectures.reduce(
          (n,a)=>n+a.question_count,
          0
        ),
        attempts:architectures.reduce(
          (n,a)=>n+a.markedAttempts,
          0
        )
      }))
      .sort((a,b)=>a.name.localeCompare(b.name));
  },[rows]);


  const totalArchitectures=rows.length;

  const encounteredArchitectures=rows.filter(
    row=>row.encountered
  ).length;

  const totalAttempts=rows.reduce(
    (n,row)=>n+row.markedAttempts,
    0
  );

  const totalQuestions=rows.reduce(
    (n,row)=>n+row.question_count,
    0
  );


  function toggle(topic:string){
    setExpanded(current=>{
      const next=new Set(current);

      if(next.has(topic)){
        next.delete(topic);
      }else{
        next.add(topic);
      }

      return next;
    });
  }





  function architectureKey(
    topic:string,
    architecture:string
  ){
    return `${topic}::${architecture}`;
  }

  function toggleArchitecture(
    topic:string,
    architecture:string
  ){
    const key=architectureKey(topic,architecture);

    setSelectedArchitectures(current=>{
      const next=new Set(current);

      if(next.has(key)){
        next.delete(key);
      }else{
        next.add(key);
      }

      return next;
    });
  }

  function selectNotEncountered(topic:any){
    setSelectedArchitectures(current=>{
      const next=new Set(current);

      topic.architectures.forEach((architecture:any)=>{
        if(!architecture.encountered){
          next.add(
            architectureKey(
              topic.name,
              architecture.architecture
            )
          );
        }
      });

      return next;
    });
  }

  function clearTopicArchitectures(topic:any){
    setSelectedArchitectures(current=>{
      const next=new Set(current);

      topic.architectures.forEach((architecture:any)=>{
        next.delete(
          architectureKey(
            topic.name,
            architecture.architecture
          )
        );
      });

      return next;
    });
  }

  const selectedArchitectureQuestionIds=(()=>{
    if(!catalogue) return [] as string[];

    const ids:string[]=[];

    catalogue.architectures.forEach(architecture=>{
      const key=architectureKey(
        architecture.topic,
        architecture.architecture
      );

      if(selectedArchitectures.has(key)){
        ids.push(...architecture.question_ids);
      }
    });

    return [...new Set(ids)];
  })();

  function practiseSelectedArchitectures(){
    if(!selectedArchitectureQuestionIds.length) return;

    const shuffled=[
      ...selectedArchitectureQuestionIds
    ];

    for(let i=shuffled.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [shuffled[i],shuffled[j]]=[
        shuffled[j],
        shuffled[i]
      ];
    }

    const count=Math.min(
      architectureSetCount,
      shuffled.length
    );

    const ids=shuffled.slice(0,count);

    const params=new URLSearchParams({
      topic:'Architecture Practice',
      count:String(count),
      mode:'practice',
      ask:loggedIn===false ? '0' : '1',
      solutions:'1',
      timer:'0',
      freeNav:'1',
      ids:ids.join(',')
    });

    window.location.href=`/practice?${params.toString()}`;
  }

  if(loading){
    return (
      <main className="main">
      

        <div className="placeholder">
          Loading real coverage…
        </div>
      </main>
    );
  }


  return (
    <main className="main coveragePage">
      <div className="crumb">
        <Link href="/">Home</Link>
        <span>/</span>
        Coverage
      </div>

      <section className="coverageHero">
        <div className="coverageHeroCopy">
          <div className="coverageEyebrow">
            QUESTION ARCHITECTURES
          </div>

          <h1>
            Know what you&apos;ve covered.
            <br />
            See what you&apos;ve missed.
          </h1>

          <p>
            DOJO breaks topics down into the recurring question
            structures that actually appear in exams, then tracks
            which ones you&apos;ve encountered.
          </p>
        </div>

        <div className="coverageArchitectureDemo">
          <div className="coverageDemoTopic">
            <span>INTEGRATION</span>
            <strong>Areas between curves</strong>
          </div>

          <div className="coverageDemoBranches">
            <div className="coverageDemoBranch seen">
              <span className="coverageDemoState">ENCOUNTERED</span>
              <strong>Area under a curve</strong>
              <small>
                The curve and boundaries are given directly.
              </small>
            </div>

            <div className="coverageDemoBranch">
              <span className="coverageDemoState">UNSEEN</span>
              <strong>Area bounded by a tangent</strong>
              <small>
                Find the tangent, then use it as a boundary.
              </small>
            </div>

            <div className="coverageDemoBranch">
              <span className="coverageDemoState">UNSEEN</span>
              <strong>Area bounded by a normal</strong>
              <small>
                Find the normal, then use it as a boundary.
              </small>
            </div>
          </div>

          <div className="coverageDemoMessage">
            <strong>
              Same subtopic. Different question structures.
            </strong>
            <span>
              DOJO tracks each one separately.
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div
          className="placeholder"
          style={{marginBottom:'20px'}}
        >
          {error}
        </div>
      )}

      {loggedIn===false && (
        <section className="coverageAccountPrompt">
          <div>
            <div className="coverageEyebrow">
              BUILD YOUR COVERAGE
            </div>
            <strong>
              See the architectures your practice has reached
            </strong>
            <span>
              Mark questions in DOJO and your coverage builds
              automatically, showing what you have encountered
              and what is still waiting.
            </span>
          </div>

          <div className="coverageAccountActions">
            <Link
              href="/signup?next=%2Fcoverage"
              className="coveragePrimaryAction"
            >
              Create free account
            </Link>

            <Link
              href="/login?next=%2Fcoverage"
              className="coverageSecondaryAction"
            >
              Log in
            </Link>
          </div>
        </section>
      )}

      <section className="coverageOverview">
        <div className="coverageOverviewHeading">
          <div>
            <div className="coverageEyebrow">
              YOUR A-LEVEL MATHEMATICS COVERAGE
            </div>
            <h2>Coverage by area</h2>
          </div>

          <span className="coverageOverviewNote">
            Architecture tracking grows with the DOJO bank.
          </span>
        </div>

        <div className="coverageAreaGrid">
          <div className="coverageAreaCard active">
            <div className="coverageAreaTop">
              <span>PURE MATHEMATICS</span>
              <strong>LIVE</strong>
            </div>

            <div className="coverageAreaMetric">
              {loggedIn===false ? (
                <>
                  <strong>{totalArchitectures}</strong>
                  <span>architectures mapped</span>
                </>
              ) : (
                <>
                  <strong>
                    {encounteredArchitectures}
                    <small> / {totalArchitectures}</small>
                  </strong>
                  <span>architectures encountered</span>
                </>
              )}
            </div>

            <div className="coverageAreaProgress">
              <span
                style={{
                  width:loggedIn===false
                    ? '0%'
                    : `${pct(
                        encounteredArchitectures,
                        totalArchitectures
                      )}%`
                }}
              />
            </div>

            <div className="coverageAreaFoot">
              <span>
                {loggedIn===false
                  ? `${totalQuestions} questions currently in the bank`
                  : `${pct(
                      encounteredArchitectures,
                      totalArchitectures
                    )}% covered`}
              </span>

              <span>
                {loggedIn===false
                  ? 'Sign in to track'
                  : `${totalAttempts} marked attempts`}
              </span>
            </div>
          </div>

          <div className="coverageAreaCard upcoming">
            <div className="coverageAreaTop">
              <span>STATISTICS</span>
              <strong>COMING</strong>
            </div>

            <div className="coverageUpcomingBody">
              <strong>Architecture tracking is coming</strong>
              <span>
                Statistics coverage will appear here as the
                DOJO Statistics bank is added.
              </span>
            </div>
          </div>

          <div className="coverageAreaCard upcoming">
            <div className="coverageAreaTop">
              <span>MECHANICS</span>
              <strong>COMING</strong>
            </div>

            <div className="coverageUpcomingBody">
              <strong>Architecture tracking is coming</strong>
              <span>
                Mechanics coverage will appear here as the
                DOJO Mechanics bank is added.
              </span>
            </div>
          </div>
        </div>
      </section>

      <section className="coverageTopicSection">
        <div className="coverageTopicHeading">
          <div>
            <div className="coverageEyebrow">
              PURE MATHEMATICS
            </div>
            <h2>Your topic coverage</h2>
          </div>

          <div className="coverageTopicLegend">
            <span>
              {topics.length} topics
            </span>
            <span>
              {totalArchitectures} architectures
            </span>
          </div>
        </div>

        <div className="coverageTopicGrid">
          {topics.map(topic=>{
            const open=expanded.has(topic.name);
            const percentage=pct(
              topic.encountered,
              topic.total
            );

            return (
              <article
                className={
                  `coverageTopicCard${open ? ' open' : ''}`
                }
                key={topic.name}
              >
                <button
                  type="button"
                  className="coverageTopicButton"
                  onClick={()=>toggle(topic.name)}
                >
                  <div className="coverageTopicMain">
                    <strong>{topic.name}</strong>

                    <span>
                      {loggedIn===false
                        ? `${topic.total} architectures`
                        : `${topic.encountered} of ${topic.total} encountered`}
                    </span>
                  </div>

                  <div className="coverageTopicScore">
                    <strong>
                      {loggedIn===false
                        ? topic.total
                        : `${percentage}%`}
                    </strong>

                    <span
                      className={
                        `coverageTopicChevron${
                          open ? ' open' : ''
                        }`
                      }
                      aria-hidden="true"
                    />
                  </div>

                  <div className="coverageTopicProgress">
                    <span
                      style={{
                        width:loggedIn===false
                          ? '0%'
                          : `${percentage}%`
                      }}
                    />
                  </div>

                  <div className="coverageTopicMeta">
                    <span>
                      {topic.questionCount} bank questions
                    </span>

                    <span>
                      {loggedIn===false
                        ? 'Sign in to track'
                        : `${topic.attempts} marked attempts`}
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="coverageArchitecturePanel">
                    <div className="coverageArchitectureToolbar">
                      <div>
                        <strong>
                          Choose architectures to practise
                        </strong>

                        <span>
                          Target specific question structures
                          within {topic.name}.
                        </span>
                      </div>

                      <div className="coverageArchitectureToolbarActions">
                        {loggedIn!==false && (
                          <button
                            type="button"
                            onClick={()=>
                              selectNotEncountered(topic)
                            }
                          >
                            Select not encountered
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={()=>
                            clearTopicArchitectures(topic)
                          }
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {selectedArchitectures.size>0 && (
                      <div className="coverageArchitectureSelectedSummary">
                        <div className="coverageArchitectureSelectionText">
                          <strong>
                            {selectedArchitectures.size}
                            {' '}
                            {selectedArchitectures.size===1
                              ? 'architecture selected'
                              : 'architectures selected'}
                          </strong>

                          <span>
                            {selectedArchitectureQuestionIds.length}
                            {' questions available'}
                          </span>
                        </div>

                        <div className="coverageArchitectureSetControls">
                          <div className="coverageArchitectureSetSizes">
                            {[5,10,15,20].map(count=>(
                              <button
                                type="button"
                                key={count}
                                disabled={
                                  count >
                                  selectedArchitectureQuestionIds.length
                                }
                                className={
                                  architectureSetCount===count
                                    ? 'active'
                                    : ''
                                }
                                onClick={()=>
                                  setArchitectureSetCount(count)
                                }
                              >
                                {count}
                              </button>
                            ))}
                          </div>

                          <button
                            type="button"
                            className="coverageArchitecturePractise"
                            onClick={practiseSelectedArchitectures}
                          >
                            Practise selected architectures
                            <span aria-hidden="true">
                              &rarr;
                            </span>
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="coverageArchitectureList">
                      {topic.architectures.map(architecture=>{
                        const key=architectureKey(
                          topic.name,
                          architecture.architecture
                        );

                        const selected=
                          selectedArchitectures.has(key);

                        return (
                          <button
                            type="button"
                            className={
                              'coverageArchitectureRow '+
                              (
                                architecture.markedAttempts===0
                                  ? 'coverageArchitectureZero '
                                  : architecture.markedAttempts<=2
                                    ? 'coverageArchitectureLow '
                                    : architecture.markedAttempts<=5
                                      ? 'coverageArchitectureMedium '
                                      : 'coverageArchitectureHigh '
                              )+
                              (selected
                                ? 'coverageArchitectureRowSelected'
                                : '')
                            }
                            key={key}
                            aria-pressed={selected}
                            onClick={()=>
                              toggleArchitecture(
                                topic.name,
                                architecture.architecture
                              )
                            }
                          >
                            <div className="coverageArchitectureMain">
                              <span
                                className="coverageArchitectureCheck"
                                aria-hidden="true"
                              />

                              <div>
                                <strong>
                                  {readableArchitecture(
                                    architecture.architecture
                                  )}
                                </strong>

                                {architecture.family && (
                                  <span>
                                    {readableArchitecture(
                                      architecture.family
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="coverageArchitectureInfo">
                              <div className="coverageArchitectureState">
                                {loggedIn===false
                                  ? 'Not tracked'
                                  : architecture.encountered
                                    ? 'Encountered'
                                    : 'Not encountered'}
                              </div>

                              <div className="coverageArchitectureMeta">
                                {architecture.question_count}
                                {' '}
                                {architecture.question_count===1
                                  ? 'question'
                                  : 'questions'}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>


                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {!rows.length && !error && (
        <div className="placeholder">
          No question architectures were found in the
          published banks.
        </div>
      )}

      <section className="coveragePaperSection">
        <div className="coveragePaperSectionHeading">
          <h2>PAST PAPER COVERAGE</h2>
          <p>
            See which past papers you&apos;ve completed and keep
            your scores, flagged questions and notes together.
          </p>
        </div>

        <div className="coveragePaperExplainer">
          <div className="coveragePaperBenefits">
            <strong className="coveragePaperPanelTitle">
              Your papers. Your history.
            </strong>

            <span className="coveragePaperPanelCopy">
              Open any paper to see the questions you flagged
              and the notes you made while reviewing it.
            </span>

            <Link
              href="/coverage/papers"
              className="coveragePaperAction"
            >
              View paper coverage
              <span aria-hidden="true">&rarr;</span>
            </Link>
          </div>

          <div className="coveragePaperPreview">
            <div className="coveragePaperPreviewTop">
              <div>
                <span>PAST PAPERS</span>
                <strong>Your paper history</strong>
              </div>

              <span className="coveragePaperPreviewCount">
                3 completed
              </span>
            </div>

            <div className="coveragePaperPreviewRows">
              <div className="coveragePaperPreviewRow">
                <div>
                  <strong>Paper 1</strong>
                  <span>June 2025</span>
                </div>

                <strong>68%</strong>

                <span className="coveragePaperFlag">
                  6 flagged
                </span>

                <span className="coveragePaperNote">
                  2 notes
                </span>
              </div>

              <div className="coveragePaperPreviewExpanded">
                <div className="coveragePaperPreviewRow">
                  <div>
                    <strong>Paper 2</strong>
                    <span>June 2025</span>
                  </div>

                  <strong>74%</strong>

                  <span className="coveragePaperFlag">
                    3 flagged
                  </span>

                  <span className="coveragePaperNote">
                    1 note
                  </span>
                </div>

                <div className="coveragePaperDetail">
                  <div className="coveragePaperDetailFlags">
                    <span>FLAGGED QUESTIONS</span>

                    <div>
                      <strong>Q7</strong>
                      <small>Integration</small>
                    </div>

                    <div>
                      <strong>Q12</strong>
                      <small>Trigonometry</small>
                    </div>

                    <div>
                      <strong>Q15</strong>
                      <small>Proof</small>
                    </div>
                  </div>

                  <div className="coveragePaperDetailNote">
                    <span>NOTE</span>
                    <p>
                      Revisit Q12 - missed the identity before
                      rearranging.
                    </p>
                  </div>
                </div>
              </div>

              <div className="coveragePaperPreviewRow">
                <div>
                  <strong>Paper 3</strong>
                  <span>June 2025</span>
                </div>

                <strong>71%</strong>

                <span className="coveragePaperFlag">
                  4 flagged
                </span>

                <span className="coveragePaperNote">
                  3 notes
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <style jsx global>{`
        .coveragePage{
          padding-bottom:64px;
        }

        .coverageEyebrow{
          font-size:11px;
          line-height:1;
          font-weight:850;
          letter-spacing:.14em;
          text-transform:uppercase;
          opacity:.58;
        }

        .coverageHero{
          display:grid;
          grid-template-columns:minmax(0,.78fr) minmax(520px,1.22fr);
          gap:42px;
          align-items:center;
          padding:38px 0 46px;
        }

        .coverageHeroCopy h1{
          margin:12px 0 16px;
          max-width:620px;
          font-size:clamp(34px,4vw,58px);
          line-height:1.02;
          letter-spacing:-.045em;
        }

        .coverageHeroCopy p{
          margin:0;
          max-width:570px;
          font-size:16px;
          line-height:1.7;
          opacity:.7;
        }

        .coverageArchitectureDemo{
          border:1px solid rgba(0,0,0,.1);
          border-radius:22px;
          background:#fff;
          padding:24px;
          box-shadow:0 18px 50px rgba(0,0,0,.07);
        }

        .coverageDemoLabel{
          font-size:10px;
          font-weight:850;
          letter-spacing:.14em;
          opacity:.48;
          margin-bottom:12px;
        }

        .coverageDemoTopic{
          display:flex;
          align-items:baseline;
          gap:9px;
          padding:15px 17px;
          border-radius:12px;
          background:#111;
          color:#fff;
          margin-bottom:12px;
        }

        .coverageDemoTopic span{
          font-size:12px;
          font-weight:850;
          letter-spacing:.1em;
        }

        .coverageDemoTopic strong{
          font-size:14px;
          font-weight:650;
          opacity:.72;
        }

        .coverageDemoBranches{
          display:grid;
          grid-template-columns:repeat(3,minmax(0,1fr));
          gap:9px;
        }

        .coverageDemoBranch{
          min-height:132px;
          padding:15px;
          border:1px solid rgba(0,0,0,.09);
          border-radius:12px;
          background:#f7f7f5;
        }

        .coverageDemoBranch.seen{
          border-color:rgba(18,79,173,.28);
          background:rgba(18,79,173,.055);
        }

        .coverageDemoState{
          display:block;
          margin-bottom:13px;
          font-size:9px;
          font-weight:850;
          letter-spacing:.12em;
          opacity:.45;
        }

        .coverageDemoBranch.seen .coverageDemoState{
          color:#124fad;
          opacity:1;
        }

        .coverageDemoBranch strong{
          display:block;
          margin-bottom:7px;
          font-size:14px;
          line-height:1.25;
        }

        .coverageDemoBranch small{
          display:block;
          font-size:11px;
          line-height:1.45;
          opacity:.6;
        }

        .coverageDemoMessage{
          display:flex;
          justify-content:space-between;
          gap:20px;
          margin-top:12px;
          padding:14px 16px;
          border-radius:12px;
          background:#fff7d6;
        }

        .coverageDemoMessage strong{
          max-width:360px;
          font-size:12px;
          line-height:1.45;
        }

        .coverageDemoMessage span{
          align-self:center;
          font-size:11px;
          line-height:1.4;
          opacity:.62;
          text-align:right;
        }

        .coverageAccountPrompt{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:28px;
          padding:22px 24px;
          margin-bottom:30px;
          border:1px solid rgba(18,79,173,.2);
          border-radius:16px;
          background:rgba(18,79,173,.045);
        }

        .coverageAccountPrompt > div:first-child{
          display:grid;
          gap:7px;
        }

        .coverageAccountPrompt > div:first-child > strong{
          font-size:17px;
        }

        .coverageAccountPrompt > div:first-child > span{
          max-width:650px;
          font-size:13px;
          line-height:1.5;
          opacity:.68;
        }

        .coverageAccountActions{
          display:flex;
          gap:9px;
          flex-shrink:0;
        }

        .coveragePrimaryAction,
        .coverageSecondaryAction{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:40px;
          padding:0 16px;
          border-radius:8px;
          font-size:13px;
          font-weight:800;
          text-decoration:none !important;
        }

        .coveragePrimaryAction{
          background:#124fad;
          color:#fff !important;
        }

        .coverageSecondaryAction{
          border:1px solid rgba(0,0,0,.15);
          background:#fff;
          color:inherit !important;
        }

        .coverageOverview{
          padding:30px 0 38px;
          border-top:1px solid rgba(0,0,0,.08);
        }

        .coverageOverviewHeading,
        .coverageTopicHeading{
          display:flex;
          align-items:flex-end;
          justify-content:space-between;
          gap:24px;
          margin-bottom:18px;
        }

        .coverageOverviewHeading h2,
        .coverageTopicHeading h2{
          margin:7px 0 0;
          font-size:26px;
          letter-spacing:-.025em;
        }

        .coverageOverviewNote,
        .coverageTopicLegend{
          font-size:12px;
          opacity:.55;
        }

        .coverageAreaGrid{
          display:grid;
          grid-template-columns:1.25fr .875fr .875fr;
          gap:12px;
        }

        .coverageAreaCard{
          min-height:205px;
          padding:20px;
          border:1px solid rgba(0,0,0,.1);
          border-radius:15px;
          background:#fff;
        }

        .coverageAreaCard.active{
          border-color:rgba(18,79,173,.24);
          background:linear-gradient(
            145deg,
            rgba(18,79,173,.06),
            #fff 56%
          );
        }

        .coverageAreaCard.upcoming{
          background:#f7f7f5;
        }

        .coverageAreaTop{
          display:flex;
          justify-content:space-between;
          gap:12px;
          font-size:10px;
          font-weight:850;
          letter-spacing:.12em;
        }

        .coverageAreaTop strong{
          color:#124fad;
          font-size:9px;
        }

        .coverageAreaCard.upcoming .coverageAreaTop strong{
          color:inherit;
          opacity:.38;
        }

        .coverageAreaMetric{
          display:grid;
          gap:2px;
          margin-top:30px;
        }

        .coverageAreaMetric > strong{
          font-size:37px;
          letter-spacing:-.04em;
        }

        .coverageAreaMetric > strong small{
          font-size:20px;
          opacity:.42;
        }

        .coverageAreaMetric > span{
          font-size:12px;
          opacity:.6;
        }

        .coverageAreaProgress,
        .coverageTopicProgress{
          overflow:hidden;
          height:5px;
          border-radius:999px;
          background:rgba(0,0,0,.08);
        }

        .coverageAreaProgress{
          margin-top:20px;
        }

        .coverageAreaProgress span,
        .coverageTopicProgress span{
          display:block;
          height:100%;
          border-radius:inherit;
          background:#124fad;
        }

        .coverageAreaFoot{
          display:flex;
          justify-content:space-between;
          gap:14px;
          margin-top:9px;
          font-size:10px;
          opacity:.52;
        }

        .coverageUpcomingBody{
          display:grid;
          gap:8px;
          align-content:end;
          height:150px;
        }

        .coverageUpcomingBody strong{
          font-size:16px;
        }

        .coverageUpcomingBody span{
          max-width:280px;
          font-size:12px;
          line-height:1.5;
          opacity:.58;
        }

        .coverageTopicSection{
          padding:34px 0 40px;
          border-top:1px solid rgba(0,0,0,.08);
        }

        .coverageTopicLegend{
          display:flex;
          gap:18px;
        }

        .coverageTopicGrid{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:10px;
          align-items:start;
        }

        .coverageTopicCard{
          overflow:hidden;
          border:1px solid rgba(0,0,0,.1);
          border-radius:13px;
          background:#fff;
        }

        .coverageTopicCard.open{
          grid-column:1 / -1;
          border-color:rgba(18,79,173,.25);
        }

        .coverageTopicButton{
          width:100%;
          padding:16px 17px 13px;
          border:0;
          background:transparent;
          color:inherit;
          text-align:left;
          font:inherit;
          cursor:pointer;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:10px 16px;
        }

        .coverageTopicMain{
          display:grid;
          gap:4px;
        }

        .coverageTopicMain strong{
          font-size:15px;
        }

        .coverageTopicMain span{
          font-size:11px;
          opacity:.56;
        }

        .coverageTopicScore{
          display:flex;
          align-items:center;
          gap:11px;
        }

        .coverageTopicScore strong{
          font-size:13px;
        }

        .coverageTopicChevron{
          width:8px;
          height:8px;
          border-right:2px solid currentColor;
          border-bottom:2px solid currentColor;
          transform:rotate(45deg) translateY(-2px);
          opacity:.42;
        }

        .coverageTopicChevron.open{
          transform:rotate(225deg) translate(-2px,-2px);
        }

        .coverageTopicProgress{
          grid-column:1 / -1;
          height:4px;
        }

        .coverageTopicMeta{
          grid-column:1 / -1;
          display:flex;
          justify-content:space-between;
          gap:12px;
          font-size:10px;
          opacity:.48;
        }

        .coverageArchitecturePanel{
          border-top:1px solid rgba(0,0,0,.08);
          background:#f7f7f5;
        }

        .coverageArchitectureToolbar{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
          padding:14px 10px 4px;
        }

        .coverageArchitectureToolbar > div:first-child{
          display:grid;
          gap:3px;
        }

        .coverageArchitectureToolbar > div:first-child strong{
          font-size:12px;
        }

        .coverageArchitectureToolbar > div:first-child span{
          font-size:10px;
          opacity:.48;
        }

        .coverageArchitectureToolbarActions{
          display:flex;
          gap:7px;
        }

        .coverageArchitectureToolbarActions button{
          appearance:none;
          border:1px solid rgba(0,0,0,.13);
          border-radius:7px;
          background:#fff;
          padding:7px 10px;
          color:#111;
          font:inherit;
          font-size:10px;
          font-weight:750;
          cursor:pointer;
        }

        .coverageArchitectureToolbarActions button:hover{
          border-color:#124fad;
        }

        .coverageArchitectureList{
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:8px;
          padding:10px;
          border-top:1px solid rgba(0,0,0,.08);
          background:#f7f7f5;
        }

        .coverageArchitectureRow{
          appearance:none;
          width:100%;
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:18px;
          align-items:center;
          min-height:66px;
          padding:13px 14px;
          border:1px solid rgba(0,0,0,.08);
          border-radius:9px;
          background:#fff;
        }

        .coverageArchitectureRow > div:first-child{
          display:grid;
          gap:5px;
          min-width:0;
        }

        .coverageArchitectureRow > div:first-child strong{
          font-size:12px;
          line-height:1.3;
          overflow-wrap:anywhere;
        }

        .coverageArchitectureRow > div:first-child span{
          font-size:9px;
          line-height:1.3;
          opacity:.42;
        }

        button.coverageArchitectureRow{
          color:inherit;
          text-align:left;
          font:inherit;
          cursor:pointer;
        }

        button.coverageArchitectureRow:hover{
          border-color:rgba(18,79,173,.42);
        }

        /* Architecture coverage frequency colours */

        button.coverageArchitectureZero{
          border:1px solid #e58b8b;
          background:#fde2e2;
          color:#5f1717;
        }

        button.coverageArchitectureZero:hover{
          border-color:#cf5f5f;
          background:#fbd7d7;
        }

        .coverageArchitectureZero
        .coverageArchitectureState{
          color:#a51f1f;
          font-weight:850;
        }

        button.coverageArchitectureLow{
          border:1px solid #dfbd4d;
          background:#fff0b8;
          color:#57450b;
        }

        button.coverageArchitectureLow:hover{
          border-color:#c69d18;
          background:#ffe99d;
        }

        .coverageArchitectureLow
        .coverageArchitectureState{
          color:#806000;
          font-weight:850;
        }

        button.coverageArchitectureMedium{
          border:1px solid #79bd89;
          background:#dff2e3;
          color:#174b24;
        }

        button.coverageArchitectureMedium:hover{
          border-color:#58a66b;
          background:#d3ecd9;
        }

        .coverageArchitectureMedium
        .coverageArchitectureState{
          color:#27713a;
          font-weight:850;
        }

        button.coverageArchitectureHigh{
          border:1px solid #31844a;
          background:#bfe3c8;
          color:#0d3d1a;
        }

        button.coverageArchitectureHigh:hover{
          border-color:#1f6d37;
          background:#b0dbbb;
        }

        .coverageArchitectureHigh
        .coverageArchitectureState{
          color:#145c29;
          font-weight:900;
        }

        .coverageArchitectureZero
        .coverageArchitectureMain,
        .coverageArchitectureLow
        .coverageArchitectureMain,
        .coverageArchitectureMedium
        .coverageArchitectureMain,
        .coverageArchitectureHigh
        .coverageArchitectureMain{
          opacity:1;
        }

        .coverageArchitectureZero
        .coverageArchitectureMain strong,
        .coverageArchitectureLow
        .coverageArchitectureMain strong,
        .coverageArchitectureMedium
        .coverageArchitectureMain strong,
        .coverageArchitectureHigh
        .coverageArchitectureMain strong{
          color:inherit;
          opacity:1;
          font-weight:800;
        }

        .coverageArchitectureZero
        .coverageArchitectureMain span{
          color:#9c5b5b;
          opacity:1;
        }

        .coverageArchitectureLow
        .coverageArchitectureMain span{
          color:#8a742b;
          opacity:1;
        }

        .coverageArchitectureMedium
        .coverageArchitectureMain span{
          color:#568361;
          opacity:1;
        }

        .coverageArchitectureHigh
        .coverageArchitectureMain span{
          color:#376d44;
          opacity:1;
        }

        .coverageArchitectureZero
        .coverageArchitectureMeta{
          color:#a56565;
        }

        .coverageArchitectureLow
        .coverageArchitectureMeta{
          color:#927a2c;
        }

        .coverageArchitectureMedium
        .coverageArchitectureMeta{
          color:#5a8464;
        }

        .coverageArchitectureHigh
        .coverageArchitectureMeta{
          color:#376d44;
        }

        button.coverageArchitectureRowSelected,
        button.coverageArchitectureRowSelected:hover{
          border-color:#111;
          box-shadow:inset 0 0 0 1px #111;
        }

        button.coverageArchitectureRowSelected
        .coverageArchitectureCheck{
          border-color:#111;
          background:#111;
          box-shadow:inset 0 0 0 4px #fff;
        }

        .coverageArchitectureMain{
          opacity:.62;
        }

        .coverageArchitectureNotEncountered
        .coverageArchitectureState{
          color:#777;
          font-weight:750;
        }

        .coverageArchitectureNotEncountered
        .coverageArchitectureMeta{
          color:#999;
        }

        button.coverageArchitectureRowSelected,
        button.coverageArchitectureRowSelected:hover{
          border-color:#111;
          background:inherit;
          box-shadow:inset 0 0 0 1px #111;
        }

        button.coverageArchitectureRowSelected
        .coverageArchitectureCheck{
          border-color:#111;
          background:#111;
          box-shadow:inset 0 0 0 4px #fff;
        }

        button.coverageArchitectureRowSelected
        .coverageArchitectureCheck::before,
        button.coverageArchitectureRowSelected
        .coverageArchitectureCheck::after{
          display:none;
          content:none;
        }

        .coverageArchitectureMain{
          display:flex;
          align-items:center;
          gap:10px;
          min-width:0;
        }

        .coverageArchitectureMain > div{
          display:grid;
          gap:5px;
          min-width:0;
        }

        .coverageArchitectureMain strong{
          font-size:12px;
          line-height:1.3;
        }

        .coverageArchitectureMain span{
          font-size:9px;
          opacity:.42;
        }

        .coverageArchitectureCheck{
          width:16px;
          height:16px;
          flex:0 0 16px;
          border:1px solid rgba(0,0,0,.22);
          border-radius:4px;
          background:#fff;
        }

        .coverageArchitectureRowSelected
        .coverageArchitectureCheck{
          border-color:#124fad;
          background:#124fad;
          box-shadow:inset 0 0 0 4px #fff;
        }

        .coverageArchitectureSelectedSummary{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:16px;
          margin:0 10px 10px;
          padding:11px 13px;
          border:1px solid rgba(18,79,173,.2);
          border-radius:8px;
          background:#fff;
        }

        .coverageArchitectureSelectedSummary strong{
          font-size:11px;
        }

        .coverageArchitectureSelectedSummary span{
          font-size:9px;
          opacity:.45;
        }

        .coverageArchitectureSelectionText{
          display:grid;
          gap:3px;
        }

        .coverageArchitectureSelectionText strong{
          font-size:11px;
        }

        .coverageArchitectureSelectionText span{
          font-size:9px;
          opacity:.48;
        }

        .coverageArchitectureSetControls{
          display:flex;
          align-items:center;
          gap:10px;
        }

        .coverageArchitectureSetSizes{
          display:flex;
          gap:4px;
        }

        .coverageArchitectureSetSizes button{
          appearance:none;
          min-width:30px;
          height:30px;
          border:1px solid rgba(0,0,0,.12);
          border-radius:6px;
          background:#fff;
          color:#111;
          font:inherit;
          font-size:10px;
          font-weight:750;
          cursor:pointer;
        }

        .coverageArchitectureSetSizes button.active{
          border-color:#124fad;
          background:#124fad;
          color:#fff;
        }

        .coverageArchitectureSetSizes button:disabled{
          cursor:not-allowed;
          opacity:.25;
        }

        .coverageArchitecturePractise{
          appearance:none;
          display:flex;
          align-items:center;
          gap:16px;
          border:0;
          border-radius:7px;
          background:#124fad;
          color:#fff;
          padding:9px 12px;
          font:inherit;
          font-size:10px;
          font-weight:800;
          cursor:pointer;
        }

        @media(max-width:760px){
          .coverageArchitectureSelectedSummary{
            align-items:stretch;
            flex-direction:column;
          }

          .coverageArchitectureSetControls{
            align-items:stretch;
            flex-direction:column;
          }

          .coverageArchitecturePractise{
            justify-content:space-between;
          }
        }

        .coverageArchitectureInfo{
          display:grid;
          justify-items:end;
          gap:4px;
          min-width:120px;
          text-align:right;
        }

        .coverageArchitectureState{
          padding:0;
          margin:0;
          border:0;
          border-radius:0;
          background:none !important;
          box-shadow:none !important;
          font-size:10px;
          line-height:1.2;
          font-weight:800;
          color:#111;
        }

        .coverageArchitectureMeta{
          padding:0;
          margin:0;
          border:0;
          border-radius:0;
          background:none !important;
          box-shadow:none !important;
          font-size:9px;
          line-height:1.2;
          font-weight:500;
          color:#999;
          opacity:1;
        }

        .coverageArchitectureState::before,
        .coverageArchitectureState::after,
        .coverageArchitectureMeta::before,
        .coverageArchitectureMeta::after,
        .coverageArchitectureInfo::before,
        .coverageArchitectureInfo::after{
          display:none !important;
          content:none !important;
          background:none !important;
          box-shadow:none !important;
        }

        .coveragePaperSection{
          margin-top:8px;
          padding-top:34px;
          border-top:1px solid rgba(0,0,0,.08);
        }

        .coveragePaperSectionHeading{
          margin-bottom:18px;
        }

        .coveragePaperSectionHeading h2{
          margin:0 0 7px;
          font-size:28px;
          line-height:1;
          letter-spacing:-.035em;
        }

        .coveragePaperSectionHeading p{
          margin:0;
          max-width:680px;
          font-size:13px;
          line-height:1.55;
          opacity:.6;
        }

        .coveragePaperExplainer{
          display:grid;
          grid-template-columns:minmax(250px,.65fr) minmax(480px,1.35fr);
          gap:32px;
          align-items:center;
          padding:28px;
          border-radius:18px;
          background:#111;
          color:#fff;
        }

        .coveragePaperBenefits{
          display:grid;
          gap:18px;
        }

        .coveragePaperPanelTitle{
          display:block;
          font-size:18px;
          line-height:1.25;
        }

        .coveragePaperPanelCopy{
          display:block;
          max-width:260px;
          margin-top:-8px;
          font-size:11px;
          line-height:1.55;
          opacity:.55;
        }

        .coveragePaperBenefit{
          display:grid;
          gap:4px;
        }

        .coveragePaperBenefit strong{
          font-size:14px;
        }

        .coveragePaperBenefit span{
          font-size:11px;
          line-height:1.45;
          opacity:.55;
        }

        .coveragePaperAction{
          display:inline-flex;
          align-items:center;
          justify-content:space-between;
          gap:20px;
          width:max-content;
          min-width:180px;
          min-height:40px;
          margin-top:4px;
          padding:0 14px;
          border-radius:8px;
          background:#fff;
          color:#111 !important;
          text-decoration:none !important;
          font-size:11px;
          font-weight:800;
        }

        .coveragePaperPreview{
          overflow:hidden;
          border-radius:13px;
          background:#fff;
          color:#111;
        }

        .coveragePaperPreviewTop{
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:16px;
          padding:16px 18px;
          border-bottom:1px solid rgba(0,0,0,.08);
        }

        .coveragePaperPreviewTop > div{
          display:grid;
          gap:3px;
        }

        .coveragePaperPreviewTop > div > span{
          font-size:9px;
          font-weight:800;
          letter-spacing:.12em;
          opacity:.4;
        }

        .coveragePaperPreviewTop > div > strong{
          font-size:13px;
        }

        .coveragePaperPreviewCount{
          padding:5px 8px;
          border-radius:999px;
          background:#f1f1ef;
          font-size:9px;
          font-weight:800;
        }

        .coveragePaperPreviewRows{
          padding:5px 18px;
        }

        .coveragePaperPreviewRow{
          display:grid;
          grid-template-columns:minmax(120px,1fr) 48px auto auto;
          gap:12px;
          align-items:center;
          min-height:58px;
          border-bottom:1px solid rgba(0,0,0,.07);
        }

        .coveragePaperPreviewRow:last-child{
          border-bottom:0;
        }

        .coveragePaperPreviewExpanded{
          border-top:1px solid rgba(18,79,173,.14);
          border-bottom:1px solid rgba(18,79,173,.14);
          background:rgba(18,79,173,.035);
        }

        .coveragePaperPreviewExpanded .coveragePaperPreviewRow{
          border-bottom:1px solid rgba(18,79,173,.1);
        }

        .coveragePaperDetail{
          display:grid;
          grid-template-columns:1fr 1.15fr;
          gap:10px;
          padding:11px 0 13px;
        }

        .coveragePaperDetailFlags,
        .coveragePaperDetailNote{
          min-width:0;
        }

        .coveragePaperDetailFlags > span,
        .coveragePaperDetailNote > span{
          display:block;
          margin-bottom:7px;
          font-size:8px;
          font-weight:850;
          letter-spacing:.11em;
          opacity:.42;
        }

        .coveragePaperDetailFlags{
          display:flex;
          flex-wrap:wrap;
          align-content:flex-start;
          gap:6px;
        }

        .coveragePaperDetailFlags > span{
          width:100%;
        }

        .coveragePaperDetailFlags > div{
          display:flex;
          align-items:center;
          gap:5px;
          padding:5px 7px;
          border-radius:7px;
          background:#fff2c7;
          color:#755600;
        }

        .coveragePaperDetailFlags strong{
          font-size:9px;
        }

        .coveragePaperDetailFlags small{
          font-size:8px;
          opacity:.72;
        }

        .coveragePaperDetailNote{
          padding:9px 11px;
          border-radius:8px;
          background:#edf3ff;
          color:#124fad;
        }

        .coveragePaperDetailNote p{
          margin:0;
          font-size:9px;
          line-height:1.45;
          color:#111;
        }

        .coveragePaperPreviewRow > div{
          display:grid;
          gap:2px;
        }

        .coveragePaperPreviewRow > div strong{
          font-size:12px;
        }

        .coveragePaperPreviewRow > div span{
          font-size:9px;
          opacity:.45;
        }

        .coveragePaperPreviewRow > strong{
          font-size:12px;
        }

        .coveragePaperFlag,
        .coveragePaperNote{
          padding:5px 8px;
          border-radius:999px;
          font-size:9px;
          font-weight:750;
          white-space:nowrap;
        }

        .coveragePaperFlag{
          background:#fff2c7;
          color:#755600;
        }

        .coveragePaperNote{
          background:#edf3ff;
          color:#124fad;
        }

        @media(max-width:900px){
          .coverageHero,
          .coveragePaperExplainer{
            grid-template-columns:1fr;
          }

          .coverageHero{
            grid-template-columns:1fr;
          }

          .coverageAreaGrid{
            grid-template-columns:1fr;
          }

          .coverageAreaCard{
            min-height:0;
          }

          .coverageUpcomingBody{
            height:auto;
            padding-top:34px;
          }
        }

        @media(max-width:700px){
          .coverageHero{
            padding-top:24px;
            gap:28px;
          }

          .coverageHeroCopy h1{
            font-size:38px;
          }

          .coverageDemoBranches,
          .coverageTopicGrid,
          .coverageArchitectureList{
            grid-template-columns:1fr;
          }

          .coverageTopicCard.open{
            grid-column:auto;
          }

          .coverageArchitectureRow:nth-child(odd){
            border-right:0;
          }

          .coverageDemoMessage,
          .coverageAccountPrompt,
          .coverageOverviewHeading,
          .coverageTopicHeading{
            align-items:flex-start;
            flex-direction:column;
          }

          .coverageDemoMessage span{
            text-align:left;
          }

          .coverageAccountActions{
            width:100%;
          }

          .coverageAccountActions a{
            flex:1;
          }
        }
      `}</style>
    </main>
  );
}


<style jsx>{`
  .coverageArchitectureSelectedSummary{
    margin:8px 10px 2px;
  }
`}</style>
