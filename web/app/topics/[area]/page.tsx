import Link from 'next/link';
import {notFound} from 'next/navigation';
import {TOPIC_AREAS,AreaKey} from '../../../lib/topics';
export default async function Area({params}:{params:Promise<{area:string}>}){const {area}=await params;const data=TOPIC_AREAS[area as AreaKey];if(!data)notFound();return <main className="main"><div className="crumb"><Link href="/topics">Topics</Link><span>›</span>{data.label}</div><h1 className="pageTitle">{data.label}</h1><p className="lede">Choose a topic to practise.</p><div className="topicList">{data.topics.map(([slug,name])=><Link className="topicLink" href={`/topics/${area}/${slug}`} key={slug}><span>{name}</span><b>→</b></Link>)}</div></main>}
