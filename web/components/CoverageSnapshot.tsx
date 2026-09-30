'use client';

import {useEffect,useMemo,useState} from 'react';
import {getCoverageCatalogue} from '../lib/api';
import {supabase} from '../lib/supabase';

type Architecture={
  topic:string;
  architecture:string;
  question_ids:string[];
  question_count:number;
};

export default function CoverageSnapshot(){
  const [architectures,setArchitectures]=
    useState<Architecture[]>([]);

  const [attempts,setAttempts]=
    useState<Record<string,number>>({});

  const [loading,setLoading]=useState(true);
  const [failed,setFailed]=useState(false);

  useEffect(()=>{
    let cancelled=false;

    async function load(){
      try{
        const bank=await getCoverageCatalogue();

        const {data:auth,error:authError}=
          await supabase.auth.getUser();

        if(authError) throw authError;

        const history:Record<string,number>={};

        if(auth.user){
          const {data:workItems,error:workError}=
            await supabase
              .from('work_items')
              .select(`
                id,
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

            for(const question of questions){
              if(!question?.marked_at) continue;

              const id=String(
                question.question_id || ''
              );

              if(!id) continue;

              history[id]=(history[id]||0)+1;
            }
          }
        }

        if(cancelled) return;

        setArchitectures(
          Array.isArray(bank?.architectures)
            ? bank.architectures
            : []
        );

        setAttempts(history);
      }catch(error){
        console.error(
          'Could not load coverage snapshot',
          error
        );

        if(!cancelled) setFailed(true);
      }finally{
        if(!cancelled) setLoading(false);
      }
    }

    load();

    return ()=>{
      cancelled=true;
    };
  },[]);


  const stats=useMemo(()=>{
    const rows=architectures.map(row=>{
      const markedAttempts=row.question_ids.reduce(
        (total,id)=>total+(attempts[id]||0),
        0
      );

      return {
        ...row,
        encountered:markedAttempts>0,
        markedAttempts
      };
    });

    const total=rows.length;

    const encountered=rows.filter(
      row=>row.encountered
    ).length;

    const unseen=total-encountered;

    const percentage=total
      ? Math.round((encountered/total)*100)
      : 0;

    const byTopic=new Map<
      string,
      {
        topic:string;
        total:number;
        encountered:number;
        unseen:number;
      }
    >();

    for(const row of rows){
      const current=
        byTopic.get(row.topic) ?? {
          topic:row.topic,
          total:0,
          encountered:0,
          unseen:0
        };

      current.total++;

      if(row.encountered){
        current.encountered++;
      }else{
        current.unseen++;
      }

      byTopic.set(row.topic,current);
    }

    const nextTopics=[...byTopic.values()]
      .filter(topic=>topic.unseen>0)
      .sort((a,b)=>{
        if(b.unseen!==a.unseen){
          return b.unseen-a.unseen;
        }

        return a.topic.localeCompare(b.topic);
      })
      .slice(0,3);

    return {
      total,
      encountered,
      unseen,
      percentage,
      nextTopics
    };
  },[architectures,attempts]);


  if(loading){
    return (
      <section className="coveragePanel">
        <p className="coverageNote">
          Loading your architecture coverage…
        </p>
      </section>
    );
  }


  if(failed){
    return (
      <section className="coveragePanel">
        <p className="coverageNote">
          Coverage is temporarily unavailable.
        </p>
      </section>
    );
  }


  return (
    <section className="coveragePanel">
      <div className="coverageHeading">
        <div>
          <div className="coverageEyebrow">
            Architecture coverage
          </div>

          <h2>
            {stats.percentage}% encountered
          </h2>
        </div>

        <div className="coverageTotal">
          {stats.encountered} / {stats.total}
        </div>
      </div>

      <div
        className="coverageTrack"
        style={{marginTop:'14px'}}
      >
        <div
          className="coverageFill"
          style={{
            width:`${stats.percentage}%`
          }}
        />
      </div>

      <p className="coverageNote">
        <strong>{stats.unseen}</strong>
        {' '}
        {stats.unseen===1
          ? 'architecture remains unseen.'
          : 'architectures remain unseen.'}
      </p>

      {stats.nextTopics.length>0 ? (
        <div className="coverageRows">
          <div
            className="coverageEyebrow"
            style={{marginBottom:'4px'}}
          >
            Biggest gaps
          </div>

          {stats.nextTopics.map(topic=>{
            const covered=topic.total
              ? Math.round(
                  (
                    topic.encountered /
                    topic.total
                  )*100
                )
              : 0;

            return (
              <div
                className="coverageRow"
                key={topic.topic}
              >
                <div className="coverageRowTop">
                  <strong>{topic.topic}</strong>

                  <span>
                    {topic.unseen} unseen
                  </span>
                </div>

                <div className="coverageTrack">
                  <div
                    className="coverageFill"
                    style={{
                      width:`${covered}%`
                    }}
                  />
                </div>

                <div className="coverageMeta">
                  {topic.encountered}
                  /
                  {topic.total}
                  {' architectures encountered'}
                </div>
              </div>
            );
          })}
        </div>
      ) : stats.total>0 ? (
        <p className="coverageNote">
          You have encountered every architecture
          currently in the bank.
        </p>
      ) : (
        <p className="coverageNote">
          No architecture metadata is available yet.
        </p>
      )}
    </section>
  );
}