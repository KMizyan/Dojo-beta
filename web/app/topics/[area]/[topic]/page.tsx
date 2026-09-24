import Link from 'next/link';
import {notFound} from 'next/navigation';
import PracticeBuilder from '../../../../components/PracticeBuilder';
import FocusPractice from '../../../../components/FocusPractice';
import {getTopics,matchBankTopic} from '../../../../lib/api';
import {focusGroups,topicInfo} from '../../../../lib/topics';

export default async function TopicPage({params}:{params:Promise<{area:string,topic:string}>}){
  const {area,topic}=await params;
  const info=topicInfo(area,topic);
  if(!info)notFound();
  const banks=await getTopics();
  const bankName=matchBankTopic(info.label,banks);
  const groups=focusGroups(topic);
  return <main className="main">
    <div className="crumb"><Link href="/topics">Topics</Link><span>›</span><Link href={`/topics/${area}`}>{info.areaLabel}</Link><span>›</span>{info.label}</div>
    <h1 className="pageTitle">{info.label}</h1>
    <section className="historyStrip"><div><b>Your {info.label} history</b><p>Your recent work and areas to revisit will appear here as you practise.</p></div><span className="historyEmpty">No history yet</span></section>
    <PracticeBuilder topic={info.label} available={!!bankName}/>
    <section className="subSection">
      <div className="eyebrow">Focus your practice</div>
      <h2>What do you want to work on?</h2>
      <p className="muted">Choose a broad area if you know what you've been covering. You can go more specific afterwards.</p>
      <FocusPractice topic={info.label} groups={groups} available={!!bankName}/>
    </section>
  </main>
}
