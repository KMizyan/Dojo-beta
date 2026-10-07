'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../../lib/supabase';
import {
  createWorkItem,
  saveQuestionMark,
  completeWorkItem,
  beginMarkingWorkItem,
  finishMarkingWorkItem
} from '../../lib/work';

type PendingClaim = {
  version:number;
  source:string;
  topic:string;
  mode:'practice'|'exam';
  questionIds:string[];
  marks:Record<string,number>;
  marksAvailable:Record<string,number>;
  totalMarks:number;
  awarded:number;
  startedAt:string;
  finishedAt:string;
  workId?:string;
};

export default function ClaimResultPage(){
  const [state,setState]=useState<
    'working'|'saved'|'none'|'error'
  >('working');

  const [message,setMessage]=useState(
    'Saving your completed work...'
  );

  useEffect(()=>{
    let cancelled=false;

    async function claim(){
      try {
        const {data:auth,error:authError} =
          await supabase.auth.getUser();

        if(authError) throw authError;

        if(!auth.user){
          if(!cancelled){
            setState('error');
            setMessage(
              'You need to be logged in before this result can be saved.'
            );
          }
          return;
        }

        const raw=localStorage.getItem('dojo-pending-claim');

        if(!raw){
          if(!cancelled){
            setState('none');
            setMessage('There is no result waiting to be saved.');
          }
          return;
        }

        const pending:PendingClaim=JSON.parse(raw);

        if(
          !Array.isArray(pending.questionIds) ||
          !pending.questionIds.length
        ){
          throw new Error('The saved result is incomplete.');
        }

        let workId=pending.workId;

        /*
         * Store the created work ID back into the local claim immediately.
         * If a later mark write fails, retrying resumes this work item
         * instead of creating a duplicate.
         */
        if(!workId){
          const work=await createWorkItem({
            kind:'question_set',
            title:pending.topic || 'Question Set',
            question_ids:pending.questionIds,
            settings:{
              mode:pending.mode,
              claimed_from_anonymous:true,
              anonymous_started_at:pending.startedAt,
              anonymous_finished_at:pending.finishedAt
            }
          });

          workId=work.id;

          localStorage.setItem(
            'dojo-pending-claim',
            JSON.stringify({
              ...pending,
              workId
            })
          );
        }

        if(!workId){
          throw new Error('Could not create work item for this result.');
        }

        const claimedWorkId=workId;

        await completeWorkItem(claimedWorkId);
        await beginMarkingWorkItem(claimedWorkId);

        for(const questionId of pending.questionIds){
          await saveQuestionMark({
            workId:claimedWorkId,
            questionId,
            marksAwarded:Number(
              pending.marks?.[questionId] ?? 0
            ),
            marksAvailable:Number(
              pending.marksAvailable?.[questionId] ?? 0
            )
          });
        }

        await finishMarkingWorkItem(claimedWorkId);

        localStorage.removeItem('dojo-pending-claim');

        if(cancelled) return;

        setState('saved');
        setMessage(
          'Your result has been saved to your DOJO history.'
        );

        window.setTimeout(()=>{
          window.location.href='/';
        },700);

      } catch(err:any) {
        console.error('Could not claim anonymous result',err);

        if(cancelled) return;

        setState('error');
        setMessage(
          'We could not save this result yet. Your local copy has been kept, so it is safe to try again.'
        );
      }
    }

    claim();

    return()=>{
      cancelled=true;
    };
  },[]);

  return (
    <main className="page claimResultPage">
      <section className="claimResultCard">
        <span className="claimResultEyebrow">
          {state==='saved' ? 'RESULT SAVED' : 'YOUR RESULT'}
        </span>

        <h1>
          {state==='working'
            ? 'Adding your work to DOJO'
            : state==='saved'
              ? 'Your work is saved'
              : state==='none'
                ? 'Nothing to import'
                : 'Your result is still safe'}
        </h1>

        <p>{message}</p>

        {state==='error' && (
          <button
            type="button"
            onClick={()=>window.location.reload()}
          >
            Try again
          </button>
        )}

        {state==='none' && (
          <Link href="/">
            Go to DOJO
          </Link>
        )}
      </section>
    </main>
  );
}
