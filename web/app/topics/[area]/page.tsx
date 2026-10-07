import Link from 'next/link';
import {notFound} from 'next/navigation';
import {TOPIC_AREAS,AreaKey} from '../../../lib/topics';

export default async function Area({params}:{params:Promise<{area:string}>}){
  const {area}=await params;
  const data=TOPIC_AREAS[area as AreaKey];
  if(!data)notFound();

  return <main className="main dojoTopics topicsArea">
    <div className="topicNavRow">
      <div className="crumb">
        <Link href="/topics">Topics</Link>
        <span>&rsaquo;</span>
        {data.label}
      </div>
      <Link href="/topics" className="topicBackButton">
        <span className="topicBackArrow" aria-hidden="true"></span>
        Back to Topics
      </Link>
    </div>

    <h1 className="pageTitle">{data.label}</h1>

    <p className="lede">Choose a topic to practise.</p>

    <Link href="/question-sets" className="multiTopicPrompt">
      <span>
        <strong>Want to practise across multiple topics?</strong>
        <small>Build a custom Question Set</small>
      </span>
      <b aria-hidden="true">&rarr;</b>
    </Link>

    <div className="topicList">
      {data.topics.map(([slug,name])=>
        <Link className="topicLink" href={`/topics/${area}/${slug}`} key={slug}>
          <span>{name}</span>
          <b>&rarr;</b>
        </Link>
      )}
    </div>
  </main>
}
