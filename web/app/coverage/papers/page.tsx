'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {supabase} from '../../../lib/supabase';

type Subject='Pure'|'Statistics'|'Mechanics';
type Level='A-level'|'AS';
type PastPaper='paper1'|'paper2'|'paper3';

type PaperResult={
  id:string;
  level:Level;
  paper:PastPaper;
  year:number;
  score:number;
  available:number;
  flagged:string[];
  notes:string;
};

const YEARS=[
  2025,
  2024,
  2023,
  2022,
  2021,
  2020
];

const SUBJECTS:Subject[]=[
  'Pure',
  'Statistics',
  'Mechanics'
];

function papersFor(subject:Subject){
  if(subject==='Pure'){
    return [
      {
        id:'paper1' as PastPaper,
        label:'Paper 1 - Pure'
      },
      {
        id:'paper2' as PastPaper,
        label:'Paper 2 - Pure'
      }
    ];
  }

  return [
    {
      id:'paper3' as PastPaper,
      label:'Paper 3 - Statistics & Mechanics'
    }
  ];
}

export default function PaperCoveragePage(){
  const [subject,setSubject]=
    useState<Subject>('Pure');

  const [level,setLevel]=
    useState<Level>('A-level');

  const [openYears,setOpenYears]=
    useState<Set<number>>(
      ()=>new Set([2025])
    );

  const [openPaper,setOpenPaper]=
    useState<string|null>(null);

  const [results,setResults]=
    useState<PaperResult[]>([]);

  const [loading,setLoading]=
    useState(true);

  const [error,setError]=
    useState('');

  const [loggedIn,setLoggedIn]=
    useState<boolean|null>(null);

  useEffect(()=>{
    let active=true;

    async function load(){
      setLoading(true);
      setError('');

      const {data:auth}=await supabase.auth.getUser();

      if(!auth.user){
        if(active){
          setLoggedIn(false);
          setResults([]);
          setLoading(false);
        }
        return;
      }

      if(active){
        setLoggedIn(true);
      }

      const {data,error}=await supabase
        .from('work_items')
        .select('id,settings,updated_at')
        .eq('user_id',auth.user.id)
        .eq('kind','past_paper')
        .order('updated_at',{ascending:false});

      if(!active) return;

      if(error){
        console.error(error);
        setError('Could not load paper records.');
        setResults([]);
        setLoading(false);
        return;
      }

      const parsed:PaperResult[]=(data ?? [])
        .map((row:any)=>{
          const settings=row.settings ?? {};

          return {
            id:String(row.id),
            level:settings.level as Level,
            paper:settings.paper as PastPaper,
            year:Number(settings.year),
            score:Number(settings.score),
            available:Number(settings.available),
            flagged:Array.isArray(settings.flagged)
              ? settings.flagged.map(String)
              : [],
            notes:String(settings.notes ?? '')
          };
        })
        .filter(
          (row:PaperResult)=>
            Boolean(row.level) &&
            Boolean(row.paper) &&
            Number.isFinite(row.year) &&
            Number.isFinite(row.score) &&
            Number.isFinite(row.available)
        );

      setResults(parsed);
      setLoading(false);
    }

    load();

    return ()=>{
      active=false;
    };
  },[]);

  function toggleYear(year:number){
    setOpenYears(current=>{
      const next=new Set(current);

      if(next.has(year)){
        next.delete(year);
      }else{
        next.add(year);
      }

      return next;
    });
  }

  function resultFor(
    year:number,
    paper:PastPaper
  ){
    return results.find(
      result=>
        result.level===level &&
        result.year===year &&
        result.paper===paper
    );
  }

  return (
    <main className="main">

      <div style={{marginBottom:'18px'}}>
        <Link
          href="/coverage"
          style={{
            textDecoration:'none',
            color:'inherit',
            opacity:.65,
            fontSize:'13px'
          }}
        >
          ← Coverage
        </Link>
      </div>

      <section style={{marginBottom:'28px'}}>
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
          Past papers
        </h1>

        <p
          style={{
            margin:0,
            maxWidth:'700px',
            opacity:.68,
            lineHeight:1.6
          }}
        >
          {loggedIn===false
            ? 'Track your paper results, flagged questions and notes.'
            : 'Your saved results, flagged questions and notes.'}
        </p>
      </section>

      {loggedIn===false && (
        <div
          className="card"
          style={{
            marginBottom:'20px',
            padding:'18px 20px',
            display:'flex',
            justifyContent:'space-between',
            alignItems:'center',
            gap:'20px',
            flexWrap:'wrap'
          }}
        >
          <div>
            <strong
              style={{
                display:'block',
                marginBottom:'5px'
              }}
            >
              Build your paper record
            </strong>

            <span
              style={{
                fontSize:'13px',
                opacity:.68,
                lineHeight:1.5
              }}
            >
              Save scores, flagged questions and notes so
              DOJO can keep your paper history in one place.
            </span>
          </div>

          <div
            style={{
              display:'flex',
              gap:'12px',
              alignItems:'center'
            }}
          >
            <Link
              href="/login?next=%2Fcoverage%2Fpapers"
              style={{
                fontWeight:700,
                color:'inherit'
              }}
            >
              Log in
            </Link>

            <Link
              href="/signup?next=%2Fcoverage%2Fpapers"
              style={{
                fontWeight:700,
                color:'inherit'
              }}
            >
              Create account →
            </Link>
          </div>
        </div>
      )}

      <div
        style={{
          display:'flex',
          gap:'8px',
          marginBottom:'12px'
        }}
      >
        {(['A-level','AS'] as Level[]).map(item=>(
          <button
            key={item}
            type="button"
            onClick={()=>{
              setLevel(item);
              setOpenPaper(null);
            }}
            style={{
              padding:'9px 14px',
              border:
                level===item
                  ? '2px solid currentColor'
                  : '1px solid rgba(0,0,0,.12)',
              borderRadius:'999px',
              background:'transparent',
              color:'inherit',
              font:'inherit',
              fontWeight:700,
              cursor:'pointer'
            }}
          >
            {item}
          </button>
        ))}
      </div>

      <div
        style={{
          display:'grid',
          gridTemplateColumns:
            'repeat(3,minmax(0,1fr))',
          gap:'10px',
          marginBottom:'26px'
        }}
      >
        {SUBJECTS.map(item=>(
          <button
            type="button"
            key={item}
            onClick={()=>{
              setSubject(item);
              setOpenPaper(null);
            }}
            style={{
              padding:'18px 14px',
              border:
                subject===item
                  ? '2px solid currentColor'
                  : '1px solid rgba(0,0,0,.12)',
              borderRadius:'12px',
              background:
                subject===item
                  ? 'rgba(0,0,0,.04)'
                  : 'transparent',
              color:'inherit',
              font:'inherit',
              fontWeight:700,
              cursor:'pointer'
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {error && (
        <p style={{marginBottom:'16px'}}>
          {error}
        </p>
      )}

      <div style={{display:'grid',gap:'10px'}}>
        {YEARS.map(year=>{
          const yearOpen=openYears.has(year);
          const papers=papersFor(subject);

          const completed=papers.filter(
            paper=>
              Boolean(
                resultFor(year,paper.id)
              )
          ).length;

          const completion=
            papers.length
              ? completed/papers.length
              : 0;

          const completionLabel=
            loggedIn===false
              ? 'Sign in to track completion'
              : completed===0
                ? 'Not started'
                : completed===papers.length
                  ? 'Complete'
                  : `${completed} of ${papers.length} completed`;

          return (
            <section
              className="card"
              key={`${level}-${subject}-${year}`}
              style={{
                padding:0,
                overflow:'hidden',
                opacity:
                  loggedIn===false
                    ? 1
                    : completed===0
                      ? .58
                      : 1,
                border:
                  loggedIn!==false &&
                  completed===papers.length
                    ? '2px solid currentColor'
                    : loggedIn!==false && completed>0
                      ? '1px solid rgba(0,0,0,.28)'
                      : '1px solid rgba(0,0,0,.10)'
              }}
            >
              <button
                type="button"
                onClick={()=>toggleYear(year)}
                style={{
                  width:'100%',
                  border:0,
                  background:'transparent',
                  color:'inherit',
                  padding:'18px 20px',
                  display:'grid',
                  gridTemplateColumns:'1fr auto',
                  alignItems:'center',
                  textAlign:'left',
                  font:'inherit',
                  cursor:'pointer'
                }}
              >
                <div>
                  <strong
                    style={{
                      display:'block',
                      fontSize:'18px',
                      marginBottom:'4px'
                    }}
                  >
                    {year}
                  </strong>

                  <div
                    style={{
                      marginTop:'6px',
                      display:'grid',
                      gap:'7px',
                      maxWidth:'280px'
                    }}
                  >
                    <div
                      style={{
                        display:'flex',
                        alignItems:'center',
                        gap:'8px',
                        fontSize:'12px'
                      }}
                    >
                      <strong>
                        {loading
                          ? 'Loading...'
                          : completionLabel}
                      </strong>

                      {!loading &&
                        loggedIn!==false &&
                        completed>0 && (
                          <span style={{opacity:.55}}>
                            {completed}/{papers.length}
                          </span>
                        )}
                    </div>

                    {!loading && loggedIn!==false && (
                      <div
                        style={{
                          height:'5px',
                          width:'100%',
                          borderRadius:'999px',
                          background:'rgba(0,0,0,.08)',
                          overflow:'hidden'
                        }}
                      >
                        <div
                          style={{
                            width:`${completion*100}%`,
                            height:'100%',
                            background:'currentColor',
                            borderRadius:'999px',
                            transition:'width .2s ease'
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <span>
                  {yearOpen ? '↑' : '↓'}
                </span>
              </button>

              {yearOpen && (
                <div
                  style={{
                    borderTop:
                      '1px solid rgba(0,0,0,.08)'
                  }}
                >
                  {papers.map(paper=>{
                    const key=
                      `${level}-${subject}-${year}-${paper.id}`;

                    const result=
                      resultFor(year,paper.id);

                    const done=
                      Boolean(result);

                    const expanded=
                      openPaper===key;

                    return (
                      <div
                        key={key}
                        style={{
                          opacity:
                            loggedIn===false
                              ? 1
                              : done
                                ? 1
                                : .45,
                          borderBottom:
                            '1px solid rgba(0,0,0,.06)'
                        }}
                      >
                        <button
                          type="button"
                          onClick={()=>
                            setOpenPaper(
                              expanded
                                ? null
                                : key
                            )
                          }
                          style={{
                            width:'100%',
                            border:0,
                            background:'transparent',
                            color:'inherit',
                            padding:'16px 20px',
                            display:'grid',
                            gridTemplateColumns:
                              '1fr auto',
                            alignItems:'center',
                            textAlign:'left',
                            font:'inherit',
                            cursor:'pointer'
                          }}
                        >
                          <div>
                            <strong>
                              {paper.label}
                            </strong>

                            <div
                              style={{
                                marginTop:'4px',
                                fontSize:'12px'
                              }}
                            >
                              {loggedIn===false
                                ? 'Result not tracked'
                                : done
                                  ? '✓ Completed'
                                  : 'Not attempted'}
                            </div>
                          </div>

                          <div>
                            {result && (
                              <strong
                                style={{
                                  marginRight:'14px'
                                }}
                              >
                                {result.score}
                                /
                                {result.available}
                              </strong>
                            )}

                            <span>
                              {expanded ? '↑' : '↓'}
                            </span>
                          </div>
                        </button>

                        {expanded && (
                          <div
                            style={{
                              padding:'2px 20px 20px'
                            }}
                          >
                            {result ? (
                              <>
                                <div
                                  style={{
                                    display:'grid',
                                    gridTemplateColumns:
                                      'repeat(3,minmax(0,1fr))',
                                    gap:'10px',
                                    marginBottom:'18px'
                                  }}
                                >
                                  <div
                                    className="card"
                                    style={{padding:'14px'}}
                                  >
                                    <small style={{opacity:.55}}>
                                      Score
                                    </small>

                                    <strong
                                      style={{
                                        display:'block',
                                        fontSize:'20px',
                                        marginTop:'4px'
                                      }}
                                    >
                                      {result.score}
                                      /
                                      {result.available}
                                    </strong>
                                  </div>

                                  <div
                                    className="card"
                                    style={{padding:'14px'}}
                                  >
                                    <small style={{opacity:.55}}>
                                      Percentage
                                    </small>

                                    <strong
                                      style={{
                                        display:'block',
                                        fontSize:'20px',
                                        marginTop:'4px'
                                      }}
                                    >
                                      {result.available>0
                                        ? Math.round(
                                            (
                                              result.score /
                                              result.available
                                            ) * 100
                                          )
                                        : 0}
                                      %
                                    </strong>
                                  </div>

                                  <div
                                    className="card"
                                    style={{padding:'14px'}}
                                  >
                                    <small style={{opacity:.55}}>
                                      Grade
                                    </small>

                                    <strong
                                      style={{
                                        display:'block',
                                        fontSize:'20px',
                                        marginTop:'4px'
                                      }}
                                    >
                                      N/A
                                    </strong>
                                  </div>
                                </div>

                                <div
                                  style={{
                                    marginBottom:'18px'
                                  }}
                                >
                                  <strong>
                                    Flagged questions
                                  </strong>

                                  <div
                                    style={{
                                      display:'flex',
                                      gap:'7px',
                                      flexWrap:'wrap',
                                      marginTop:'8px'
                                    }}
                                  >
                                    {result.flagged.length
                                      ? result.flagged.map(
                                          question=>(
                                            <span
                                              key={question}
                                              style={{
                                                padding:'5px 9px',
                                                border:
                                                  '1px solid rgba(0,0,0,.12)',
                                                borderRadius:'999px',
                                                fontSize:'12px'
                                              }}
                                            >
                                              {question}
                                            </span>
                                          )
                                        )
                                      : (
                                        <span
                                          style={{
                                            fontSize:'13px',
                                            opacity:.55
                                          }}
                                        >
                                          None
                                        </span>
                                      )}
                                  </div>
                                </div>

                                <div>
                                  <strong>Notes</strong>

                                  <div
                                    style={{
                                      marginTop:'8px',
                                      padding:'13px',
                                      border:
                                        '1px solid rgba(0,0,0,.1)',
                                      borderRadius:'10px',
                                      fontSize:'13px',
                                      lineHeight:1.5
                                    }}
                                  >
                                    {result.notes ||
                                      'No notes saved.'}
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div>
                                <p
                                  style={{
                                    margin:'0 0 10px',
                                    fontSize:'13px'
                                  }}
                                >
                                  {loggedIn===false
                                    ? 'Sign in to track your result for this paper.'
                                    : 'No result has been logged for this paper yet.'}
                                </p>

                                <Link
                                  href={
                                    loggedIn===false
                                      ? '/signup?next=%2Fcoverage%2Fpapers'
                                      : '/papers'
                                  }
                                  style={{
                                    fontSize:'13px',
                                    fontWeight:700
                                  }}
                                >
                                  {loggedIn===false
                                    ? 'Create an account to track it'
                                    : 'Go to Papers to log it'}
                                </Link>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </main>
  );
}