import Link from 'next/link';
import {TOPIC_AREAS} from '../../lib/topics';
export default function Topics(){return <main className="main"><div className="eyebrow">A-level Mathematics</div><h1 className="pageTitle">Topics</h1><p className="lede">Choose an area of maths.</p><div className="areaGrid">{Object.entries(TOPIC_AREAS).map(([key,a])=><Link className="areaCard" href={`/topics/${key}`} key={key}><h2>{a.label}</h2><p>{a.description}</p><span>Open {a.label} →</span></Link>)}</div></main>}

