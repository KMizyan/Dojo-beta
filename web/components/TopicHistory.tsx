'use client';

import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '../lib/supabase';
import {getQuestionsBulk} from '../lib/api';

type View = 'in_progress' | 'latest';

type WorkQuestion = {
  question_id:string;
  position?:number|null;
};

type WorkItem = {
  id:string;
  title:string;
  kind:string;
  status:string;
  settings?:Record<string,unknown>|null;
  created_at:string|null;
  completed_at:string|null;
  marked_at:string|null;
  work_questions?:WorkQuestion[];
};

type Recovery = {
  id:string;
  topic:string;
  mode:'practice'|'exam';
  status:'in-progress'|'marking';
  questionIds:string[];
  currentQuestion:number;
  stage?:string;
  startedAt?:string;
  updatedAt?:string;
};

type Row = {
  key:string;
  title:string;
  status:string;
  date:string|null;
  count:number;
  href:string;
};

function isPaper(item:WorkItem){
  return (
    item.kind === 'generated_paper' ||
    item.kind === 'past_paper'
  );
}

function unfinished(status:string){
  return (
    status === 'in_progress' ||
    status === 'completed' ||
    status === 'marking'
  );
}

function statusLabel(status:string){
  if(status === 'in_progress') return 'In progress';
  if(status === 'completed') return 'Ready to mark';
  if(status === 'marking') return 'Marking';
  if(status === 'marked') return 'Marked';
  return status;
}

function dateLabel(value:string|null){
  if(!value) return '';

  const date=new Date(value);

  if(Number.isNaN(date.getTime())){
    return '';
  }

  return date.toLocaleDateString(
    undefined,
    {
      day:'numeric',
      month:'short',
      year:'numeric'
    }
  );
}

function sameIds(a:string[],b:string[]){
  if(a.length !== b.length) return false;

  const aa=[...a].sort();
  const bb=[...b].sort();

  return aa.every(
    (id,index)=>id === bb[index]
  );
}

export default function TopicHistory({
  topic,
  returnTo
}:{
  topic:string;
  returnTo:string;
}){
  const [view,setView]=
    useState<View>('in_progress');

  const [expanded,setExpanded]=
    useState(false);

  const [work,setWork]=
    useState<WorkItem[]>([]);

  const [recovery,setRecovery]=
    useState<Recovery|null>(null);

  const [questionTopics,setQuestionTopics]=
    useState<Record<string,string>>({});

  const [loading,setLoading]=
    useState(true);

  const [loggedIn,setLoggedIn]=
    useState<boolean|null>(null);

  useEffect(()=>{
    let cancelled=false;

    async function load(){
      try{
        const {data:auth}=
          await supabase.auth.getUser();

        if(!cancelled){
          setLoggedIn(Boolean(auth.user));
        }

        let loadedWork:WorkItem[]=[];

        if(auth.user){
          const {data,error}=await supabase
            .from('work_items')
            .select(`
              id,
              title,
              kind,
              status,
              settings,
              created_at,
              completed_at,
              marked_at,
              work_questions (
                question_id,
                position
              )
            `)
            .order(
              'created_at',
              {ascending:false}
            )
            .limit(50);

          if(error) throw error;

          loadedWork=
            (data ?? []) as WorkItem[];
        }

        let loadedRecovery:Recovery|null=null;

        try{
          const key=
            localStorage.getItem(
              'dojo-continue'
            );

          if(key){
            const raw=
              localStorage.getItem(key);

            if(raw){
              const value=JSON.parse(raw);

              if(
                Array.isArray(
                  value?.questionIds
                ) &&
                value.questionIds.length &&
                (
                  value.status ===
                    'in-progress' ||
                  value.status ===
                    'marking'
                )
              ){
                loadedRecovery={
                  id:String(
                    value.id ?? key
                  ),
                  topic:String(
                    value.topic ??
                    'Question Set'
                  ),
                  mode:
                    value.mode === 'exam'
                      ? 'exam'
                      : 'practice',
                  status:
                    value.status ===
                      'marking'
                      ? 'marking'
                      : 'in-progress',
                  questionIds:
                    value.questionIds.map(
                      String
                    ),
                  currentQuestion:
                    Number(
                      value.currentQuestion ??
                      0
                    ),
                  stage:
                    value.stage
                      ? String(value.stage)
                      : undefined,
                  startedAt:
                    value.startedAt
                      ? String(
                          value.startedAt
                        )
                      : undefined,
                  updatedAt:
                    value.updatedAt
                      ? String(
                          value.updatedAt
                        )
                      : undefined
                };
              }
            }
          }
        }catch(err){
          console.warn(
            'Could not restore topic Continue',
            err
          );
        }

        const ids=new Set<string>();

        loadedWork.forEach(item=>{
          (item.work_questions ?? [])
            .forEach(row=>{
              if(row.question_id){
                ids.add(
                  String(row.question_id)
                );
              }
            });
        });

        loadedRecovery?.questionIds
          .forEach(id=>ids.add(id));

        const loadedQuestions=
          await getQuestionsBulk(
            [...ids]
          );

        const topicEntries=
          loadedQuestions.map(
            (question:any)=>[
              String(
                question?.id ??
                question?.question_id ??
                ''
              ),
              String(
                question?.topic ?? ''
              )
            ] as const
          );

        if(cancelled) return;

        setWork(loadedWork);
        setRecovery(loadedRecovery);
        setQuestionTopics(
          Object.fromEntries(
            topicEntries
          )
        );
      }catch(err){
        console.error(
          'Could not load topic history',
          err
        );

        if(!cancelled){
          setWork([]);
          setRecovery(null);
          setQuestionTopics({});
        }
      }finally{
        if(!cancelled){
          setLoading(false);
        }
      }
    }

    load();

    return ()=>{
      cancelled=true;
    };
  },[]);

  const rows=useMemo(()=>{
    const wanted=
      topic.trim().toLowerCase();

    const persisted=work
      .filter(item=>{
        if(item.kind !== 'question_set'){
          return false;
        }

        if(
          item.title
            .trim()
            .toLowerCase() === 'similar practice'
        ){
          return false;
        }

        const itemQuestions=
          item.work_questions ?? [];

        if(itemQuestions.length === 0){
          return false;
        }

        return itemQuestions.some(row=>
          (
            questionTopics[
              String(
                row.question_id
              )
            ] ?? ''
          )
            .trim()
            .toLowerCase() ===
            wanted
        );
      })
      .map<Row>(item=>({
        key:`work-${item.id}`,
        title:
          item.title ||
          'Question Set',
        status:item.status,
        date:
          item.marked_at ??
          item.completed_at ??
          item.created_at,
        count:
          item.work_questions
            ?.length ?? 0,
        href:
          `/practice?work=${
            encodeURIComponent(
              item.id
            )
          }`
      }));

    const result=[...persisted];

    if(recovery){
      const matches=
        recovery.questionIds.some(
          id=>
            (
              questionTopics[id] ??
              ''
            )
              .trim()
              .toLowerCase() ===
              wanted
        );

      if(matches){
        const duplicate=
          work.some(item=>{
            if(isPaper(item)){
              return false;
            }

            if(!unfinished(item.status)){
              return false;
            }

            const ids=
              (
                item.work_questions ??
                []
              ).map(row=>
                String(
                  row.question_id
                )
              );

            return sameIds(
              ids,
              recovery.questionIds
            );
          });

        if(!duplicate){
          const resumeStage=
            recovery.status ===
              'marking' ||
            recovery.stage ===
              'marking'
              ? 'marking'
              : 'doing';

          const href=
            `/practice?topic=${
              encodeURIComponent(
                recovery.topic ||
                topic
              )
            }` +
            `&mode=${
              encodeURIComponent(
                recovery.mode
              )
            }` +
            `&ids=${
              encodeURIComponent(
                recovery.questionIds
                  .join(',')
              )
            }` +
            `&resumeQuestion=${
              encodeURIComponent(
                String(
                  recovery
                    .currentQuestion ??
                  0
                )
              )
            }` +
            `&resumeStage=${
              encodeURIComponent(
                resumeStage
              )
            }`;

          result.unshift({
            key:
              `recovery-${
                recovery.id
              }`,
            title:
              recovery.topic ||
              'Question Set',
            status:
              recovery.status ===
                'marking'
                ? 'marking'
                : 'in_progress',
            date:
              recovery.updatedAt ??
              recovery.startedAt ??
              null,
            count:
              recovery
                .questionIds
                .length,
            href
          });
        }
      }
    }

    return result;
  },[
    work,
    recovery,
    questionTopics,
    topic
  ]);

  const visible=
    rows.filter(item=>
      view === 'in_progress'
        ? unfinished(item.status)
        : item.status === 'marked'
    );

  const displayed=
    expanded
      ? visible
      : visible.slice(0,2);

  const hiddenCount=
    Math.max(0,visible.length-2);

  if(!loading && loggedIn === false){
    const next=encodeURIComponent(returnTo);

    return (
      <section className="historyStrip topicHistoryLoggedOut">
        <div className="topicHistoryLoggedOutIntro">
          <b>Your {topic} history</b>
          <p>Work containing {topic} questions appears here.</p>
        </div>

        <div className="topicHistoryAccountPrompt">
          <div>
            <strong>Save your {topic} practice</strong>
            <p>
              Create a free account to keep your attempts, return to unfinished
              practice and see your results for this topic.
            </p>
          </div>

          <div className="topicHistoryAccountActions">
            <Link
              href={`/signup?next=${next}`}
              className="topicHistoryCreate"
            >
              Create free account
            </Link>

            <Link
              href={`/login?next=${next}`}
              className="topicHistoryLogin"
            >
              Log in
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="historyStrip">
      <div style={{width:'100%'}}>
        <div
          style={{
            display:'flex',
            justifyContent:
              'space-between',
            alignItems:'center',
            gap:'16px',
            flexWrap:'wrap'
          }}
        >
          <div>
            <b>
              Your {topic} history
            </b>

            <p>
              Work containing {topic}
              {' '}questions appears here.
            </p>
          </div>

          <div
            className="dashboardFilters"
            style={{margin:0}}
          >
            <button
              type="button"
              className={
                view ===
                  'in_progress'
                  ? 'active'
                  : ''
              }
              onClick={()=>{
                setView(
                  'in_progress'
                );
                setExpanded(false);
              }}
            >
              In progress
            </button>

            <button
              type="button"
              className={
                view === 'latest'
                  ? 'active'
                  : ''
              }
              onClick={()=>{
                setView('latest');
                setExpanded(false);
              }}
            >
              Latest
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop:'12px'
          }}
        >
          {loading && (
            <span
              className="historyEmpty"
            >
              Loading history...
            </span>
          )}

          {!loading &&
            visible.length === 0 && (
            <span
              className="historyEmpty"
            >
              {view ===
                'in_progress'
                ? 'Nothing in progress'
                : 'No completed work yet'}
            </span>
          )}

          {!loading &&
            displayed.map(item=>(
            <Link
              key={item.key}
              href={item.href}
              style={{
                display:'flex',
                justifyContent:
                  'space-between',
                alignItems:'center',
                gap:'16px',
                padding:'10px 0',
                borderTop:
                  '1px solid rgba(0,0,0,.08)',
                textDecoration:'none',
                color:'inherit'
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight:700
                  }}
                >
                  {item.title}
                </div>

                <div
                  style={{
                    marginTop:'3px',
                    fontSize:'11px',
                    opacity:.6
                  }}
                >
                  {item.count}
                  {' question'}
                  {item.count === 1
                    ? ''
                    : 's'}

                  {dateLabel(item.date)
                    ? ` · ${
                        dateLabel(
                          item.date
                        )
                      }`
                    : ''}
                </div>
              </div>

              <div
                style={{
                  display:'flex',
                  gap:'10px',
                  fontSize:'11px',
                  fontWeight:700,
                  whiteSpace:'nowrap'
                }}
              >
                <span>
                  {statusLabel(
                    item.status
                  )}
                </span>
                <span>→</span>
              </div>
            </Link>
          ))}

          {!loading && visible.length > 2 && (
            <button
              type="button"
              onClick={()=>setExpanded(value=>!value)}
              style={{
                width:'100%',
                border:0,
                borderTop:'1px solid rgba(0,0,0,.08)',
                background:'transparent',
                padding:'12px 0 2px',
                color:'#5f6661',
                font:'inherit',
                fontSize:'12px',
                fontWeight:700,
                textAlign:'left',
                cursor:'pointer'
              }}
            >
              {expanded
                ? 'Show less ↑'
                : `Show more (${hiddenCount}) ↓`}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}