import Link from 'next/link';
import PracticeSession from '../../components/PracticeSession';
import {getTopic,getTopics,matchBankTopic,selectQuestions} from '../../lib/api';

export default async function Practice({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const p=await searchParams;
  const label=p.topic||'';
  const count=Math.max(1,Math.min(20,Number(p.count)||10));

  const requested=(p.topics||'').split(',').map(x=>x.trim()).filter(Boolean);
  let qs:any[]=[];

  if(requested.length){
    const data=await selectQuestions(requested,count);
    qs=data?.questions||[];
  }else{
    const topics=await getTopics();
    const bankName=matchBankTopic(label,topics);
    const data=bankName?await getTopic(bankName):null;
    qs=(data?.questions||[]).slice(0,count);
  }

  return <main className="main practiceShell">
    <div className="crumb"><Link href="/topics">Topics</Link><span>›</span>{label}<span>›</span>Practice</div>
    {qs.length
      ? <PracticeSession persistWork={requested.length>0} topic={label} mode={p.mode==='exam'?'exam':'practice'} questions={qs} options={{askDojo:p.ask!=='0',solutions:p.solutions!=='0',timer:p.timer==='1',freeNav:p.freeNav!=='0'}}/>
      : <div className="placeholder"><b>No questions available for this selection yet.</b><p>Make sure the DOJO backend is running and can see your PrjDojo/topics folder.</p></div>}
  </main>
}

