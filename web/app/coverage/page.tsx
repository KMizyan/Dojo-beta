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

export default function CoveragePage(){
  const [catalogue,setCatalogue]=
    useState<CoverageCatalogue|null>(null);

  const [attempts,setAttempts]=
    useState<AttemptMap>({});

  const [expanded,setExpanded]=
    useState<Set<string>>(()=>new Set());

  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;

    async function load(){
      try{
        setLoading(true);
        setError('');

        const bank=await getCoverageCatalogue();

        const {data:auth,error:authError}=
          await supabase.auth.getUser();

        if(authError) throw authError;

        const history:AttemptMap={};

        if(auth.user){
          /*
           * Coverage counts MARKED QUESTIONS only.
           *
           * A work item existing is not enough.
           * A question being served is not enough.
           * work_questions.marked_at is the encounter event.
           */
          const {data:workItems,error:workError}=
            await supabase
              .from('work_items')
              .select(`
                id,
                user_id,
                work_questions (
                  question_id,
                  marked_at
                )
              `)
              .eq('user_id',auth.user.id);

          if(workError) throw workError;

          for(const work of workItems ?? []){
            const questions=
              Array.isArray(work.work_questions)
                ? work.work_questions
                : [];

            for(const q of questions){
              if(!q?.marked_at) continue;

              const id=String(q.question_id||'');
              if(!id) continue;

              history[id]=(history[id]||0)+1;
            }
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
    <main className="main">
      <div className="crumb">
        <Link href="/">Home</Link>
        <span>/</span>
        Coverage
      </div>

            <Link
        href="/coverage/papers"
        className="card"
        style={{
          display:'grid',
          gridTemplateColumns:'minmax(0,1fr) auto',
          alignItems:'center',
          gap:'20px',
          padding:'22px 24px',
          marginBottom:'24px',
          textDecoration:'none',
          color:'inherit',
          cursor:'pointer'
        }}
      >
        <div>
          <div
            style={{
              fontSize:'12px',
              fontWeight:800,
              letterSpacing:'.12em',
              textTransform:'uppercase',
              opacity:.55,
              marginBottom:'7px'
            }}
          >
            Past papers
          </div>

          <strong
            style={{
              display:'block',
              fontSize:'20px',
              marginBottom:'5px'
            }}
          >
            Paper coverage
          </strong>

          <span
            style={{
              fontSize:'13px',
              opacity:.65
            }}
          >
            See completed papers, scores, grades,
            flagged questions and notes.
          </span>
        </div>

        <span
          style={{
            fontSize:'24px',
            opacity:.55
          }}
        >
          →
        </span>
      </Link>
<section style={{marginBottom:'30px'}}>
        <div
          style={{
            fontSize:'12px',
            fontWeight:800,
            letterSpacing:'.12em',
            textTransform:'uppercase',
            opacity:.55,
            marginBottom:'8px'
          }}
        >
          Coverage
        </div>

        <h1 style={{margin:'0 0 8px'}}>
          Question architecture
        </h1>

        <p
          style={{
            margin:0,
            maxWidth:'720px',
            lineHeight:1.6,
            opacity:.7
          }}
        >
          Every architecture currently present in your
          question bank, and which ones you have actually
          marked.
        </p>
      </section>

      {error && (
        <div
          className="placeholder"
          style={{marginBottom:'20px'}}
        >
          {error}
        </div>
      )}

      <section
        style={{
          display:'grid',
          gridTemplateColumns:
            'repeat(auto-fit,minmax(180px,1fr))',
          gap:'12px',
          marginBottom:'28px'
        }}
      >
        <div className="card">
          <small>Architecture coverage</small>
          <h2 style={{margin:'6px 0'}}>
            {encounteredArchitectures}
            {' / '}
            {totalArchitectures}
          </h2>
          <span>
            {pct(
              encounteredArchitectures,
              totalArchitectures
            )}% encountered
          </span>
        </div>

        <div className="card">
          <small>Questions in bank</small>
          <h2 style={{margin:'6px 0'}}>
            {totalQuestions}
          </h2>
          <span>
            across {totalArchitectures} architectures
          </span>
        </div>

        <div className="card">
          <small>Marked attempts</small>
          <h2 style={{margin:'6px 0'}}>
            {totalAttempts}
          </h2>
          <span>
            only actually marked questions count
          </span>
        </div>
      </section>

      <section
        style={{
          display:'grid',
          gap:'12px'
        }}
      >
        {topics.map(topic=>{
          const open=expanded.has(topic.name);
          const percentage=pct(
            topic.encountered,
            topic.total
          );

          return (
            <article
              className="card"
              key={topic.name}
              style={{padding:0,overflow:'hidden'}}
            >
              <button
                type="button"
                onClick={()=>toggle(topic.name)}
                style={{
                  width:'100%',
                  border:0,
                  background:'transparent',
                  padding:'18px 20px',
                  display:'grid',
                  gridTemplateColumns:
                    'minmax(0,1fr) auto',
                  gap:'20px',
                  alignItems:'center',
                  textAlign:'left',
                  cursor:'pointer',
                  font:'inherit'
                }}
              >
                <div>
                  <strong
                    style={{
                      display:'block',
                      fontSize:'17px',
                      marginBottom:'5px'
                    }}
                  >
                    {topic.name}
                  </strong>

                  <span
                    style={{
                      fontSize:'13px',
                      opacity:.65
                    }}
                  >
                    {topic.encountered}
                    {' / '}
                    {topic.total}
                    {' architectures encountered · '}
                    {topic.questionCount}
                    {' bank questions · '}
                    {topic.attempts}
                    {' marked attempts'}
                  </span>
                </div>

                <div
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap:'14px'
                  }}
                >
                  <strong>
                    {percentage}%
                  </strong>

                  <span
                    aria-hidden="true"
                    style={{
                      fontSize:'18px',
                      transform:open
                        ? 'rotate(180deg)'
                        : 'none'
                    }}
                  >
                    ↓
                  </span>
                </div>
              </button>

              {open && (
                <div
                  style={{
                    borderTop:'1px solid rgba(0,0,0,.08)'
                  }}
                >
                  {topic.architectures.map(
                    architecture=>(
                      <div
                        key={
                          `${topic.name}::`+
                          architecture.architecture
                        }
                        style={{
                          display:'grid',
                          gridTemplateColumns:
                            'minmax(0,1fr) auto',
                          gap:'20px',
                          alignItems:'center',
                          padding:'14px 20px',
                          borderBottom:
                            '1px solid rgba(0,0,0,.06)'
                        }}
                      >
                        <div>
                          <strong
                            style={{
                              display:'block',
                              fontSize:'14px',
                              marginBottom:'4px'
                            }}
                          >
                            {architecture.architecture}
                          </strong>

                          {architecture.family && (
                            <span
                              style={{
                                fontSize:'12px',
                                opacity:.55
                              }}
                            >
                              {architecture.family}
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            textAlign:'right',
                            fontSize:'13px'
                          }}
                        >
                          <strong
                            style={{
                              display:'block'
                            }}
                          >
                            {
                              architecture.markedAttempts
                            }
                            {' marked '}
                            {
                              architecture.markedAttempts===1
                                ? 'attempt'
                                : 'attempts'
                            }
                          </strong>

                          <span style={{opacity:.6}}>
                            {
                              architecture.question_count
                            }
                            {' in bank · '}
                            {
                              architecture.markedQuestions
                            }
                            {' distinct marked'}
                          </span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {!rows.length && !error && (
        <div className="placeholder">
          No question architectures were found in the
          published banks.
        </div>
      )}

      
    </main>
  );
}