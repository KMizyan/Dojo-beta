'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import PracticeSession from './PracticeSession';

const API =
  process.env.NEXT_PUBLIC_API_URL ??
  'http://127.0.0.1:8000';

type Props = {
  workId: string;
};

export default function ResumeWork({workId}:Props) {
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [work,setWork]=useState<any>(null);
  const [questions,setQuestions]=useState<any[]>([]);

  useEffect(()=>{
    let cancelled=false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const {data:auth,error:authError} =
          await supabase.auth.getUser();

        if(authError || !auth.user) {
          throw new Error('You must be logged in to resume this work.');
        }

        const {data,error:workError} = await supabase
          .from('work_items')
          .select(`
            id,
            title,
            kind,
            status,
            settings,
            work_questions (
              position,
              question_id
            )
          `)
          .eq('id',workId)
          .single();

        if(workError || !data) {
          throw workError ?? new Error('Saved work not found.');
        }

        const refs=[...(data.work_questions || [])]
          .sort((a:any,b:any)=>a.position-b.position);

        if(!refs.length) {
          throw new Error('This work item has no saved questions.');
        }

        const loaded=await Promise.all(
          refs.map(async (ref:any)=>{
            const response=await fetch(
              `${API}/questions/${encodeURIComponent(ref.question_id)}`,
              {cache:'no-store'}
            );

            if(!response.ok) {
              throw new Error(
                `Could not load question ${ref.question_id}.`
              );
            }

            const payload=await response.json();
            const question=payload?.question ?? payload;

            return {
              ...question,
              id: question?.id ?? question?.question_id ?? ref.question_id,
              question_id: question?.question_id ?? ref.question_id
            };
          })
        );

        if(cancelled) return;

        setWork(data);
        setQuestions(loaded.filter(Boolean));
      } catch(err:any) {
        if(cancelled) return;

        console.error('Could not resume DOJO work:',err);
        setError(
          err?.message || 'Could not load this saved work.'
        );
      } finally {
        if(!cancelled) setLoading(false);
      }
    }

    load();

    return ()=>{
      cancelled=true;
    };
  },[workId]);

  if(loading) {
    return (
      <main className="main practiceShell">
        <div className="placeholder">
          <b>Loading your saved work...</b>
        </div>
      </main>
    );
  }

  if(error || !work || !questions.length) {
    return (
      <main className="main practiceShell">
        <div className="placeholder">
          <b>Could not load this saved work.</b>
          <p>{error || 'Return to My Work and try again.'}</p>
          <Link href="/my-work">Return to My Work</Link>
        </div>
      </main>
    );
  }

  const currentQuestion =
    Number(work.settings?.currentQuestion) || 0;

  const mode =
    work.settings?.mode === 'exam'
      ? 'exam'
      : 'practice';

  return (
    <main className="main practiceShell">
      <div className="crumb">
        <Link href="/my-work">My Work</Link>
        <span>›</span>
        {work.title}
      </div>

      <PracticeSession
        persistWork={false}
        existingWorkId={work.id}
        initialQuestion={currentQuestion}
        topic={work.title}
        mode={mode}
        questions={questions}
        options={{
          askDojo:mode==='practice',
          solutions:mode==='practice',
          timer:false,
          freeNav:true
        }}
      />
    </main>
  );
}
