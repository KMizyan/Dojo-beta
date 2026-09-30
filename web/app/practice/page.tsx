import Link from 'next/link';
import PracticeSession from '../../components/PracticeSession';
import GeneratedExam from '../../components/GeneratedExam';
import ResumeWork from '../../components/ResumeWork';
import {
  getTopic,
  getTopics,
  getQuestion,
  matchBankTopic,
  selectQuestions
} from '../../lib/api';

export default async function Practice({
  searchParams
}:{
  searchParams:Promise<Record<string,string|undefined>>
}){
  const p=await searchParams;

  if(p.work){
    return <ResumeWork workId={p.work} startMarking={p.mode==='mark'}/>;
  }

  const label=p.topic||'';
  const count=Math.max(
    1,
    Math.min(20,Number(p.count)||10)
  );

  const requested=(p.topics||'')
    .split(',')
    .map(x=>x.trim())
    .filter(Boolean);

  let qs:any[]=[];

  const selectedIds=(p.ids||'')
    .split(',')
    .map(x=>x.trim())
    .filter(Boolean);

  if(selectedIds.length){
    qs=(
      await Promise.all(
        selectedIds.map(id=>getQuestion(id))
      )
    ).filter(Boolean);
  }else if(requested.length){
    const data=await selectQuestions(
      requested,
      count,
      p.within || undefined
    );

    qs=data?.questions||[];
  }else{
    const topics=await getTopics();
    const bankName=matchBankTopic(
      label,
      topics
    );

    const data=bankName
      ? await getTopic(bankName)
      : null;

    qs=(data?.questions||[]).slice(
      0,
      count
    );
  }

  return (
    <main className="main practiceShell">
      <div className="crumb">
        <Link href="/topics">Topics</Link>
        <span>/</span>
        {label}
        <span>/</span>
        Practice
      </div>

      {qs.length
        ? (
          p.mode==='exam'
            ? (
              <GeneratedExam
                variant="question_set"
                questionSetTitle={
                  label || 'Question Set'
                }
                paper={{
                  level:'A-level',
                  area:label || 'Question Set',
                  total_marks:qs.reduce(
                    (total,q)=>
                      total+(Number(q?.marks)||0),
                    0
                  ),
                  requested_marks:qs.reduce(
                    (total,q)=>
                      total+(Number(q?.marks)||0),
                    0
                  ),
                  questions:qs
                }}
                options={{
                  examMode:true,
                  askDojo:false,
                  solutions:false,
                  timer:p.timer==='1',
                  freeNav:false
                }}
              />
            )
            : (
              <PracticeSession
                persistWork={true}
                initialQuestion={Math.max(
                  0,
                  Number(p.resumeQuestion)||0
                )}
                initialStage={
                  p.resumeStage==='marking'
                    ? 'marking'
                    : 'doing'
                }
                topic={label}
                mode="practice"
                questions={qs}
                options={{
                  askDojo:p.ask!=='0',
                  solutions:p.solutions!=='0',
                  timer:p.timer==='1',
                  freeNav:p.freeNav!=='0'
                }}
              />
            )
        )
        : (
          <div className="placeholder">
            <b>
              No questions available for this selection yet.
            </b>
            <p>
              Make sure the DOJO backend is running and can
              see your question banks.
            </p>
          </div>
        )}
    </main>
  );
}
