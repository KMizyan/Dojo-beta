'use client';
import {useEffect,useState} from 'react';
export default function CoverageSnapshot(){
 const [data,setData]=useState<any>(null);
 useEffect(()=>{const api=process.env.NEXT_PUBLIC_DOJO_API ?? 'http://127.0.0.1:8000';
   fetch(`${api}/coverage`).then(r=>r.ok?r.json():null).then(setData).catch(()=>{});},[]);
 if(!data)return null;
 const active=(data.topics||[]).filter((t:any)=>t.questions_completed>0).sort((a:any,b:any)=>b.coverage_percent-a.coverage_percent);
 return <section className="coveragePanel">
  <div className="coverageHeading"><div><div className="coverageEyebrow">Coverage</div>
   <h2>{data.coverage_percent}% of your current question space encountered</h2></div>
   <div className="coverageTotal">{data.dimensions_encountered} / {data.dimensions_available}</div></div>
  <p className="coverageNote">Coverage is breadth, not mastery. It tracks the question types, techniques and areas you have encountered.</p>
  {active.length===0?<p className="coverageNote">Complete some DOJO questions and your coverage will appear here.</p>:
   <div className="coverageRows">{active.map((t:any)=><div className="coverageRow" key={t.topic}>
    <div className="coverageRowTop"><strong>{t.topic}</strong><span>{t.coverage_percent}%</span></div>
    <div className="coverageTrack"><div className="coverageFill" style={{width:`${t.coverage_percent}%`}} /></div>
    <div className="coverageMeta">{t.questions_completed} questions - {t.dimensions_encountered}/{t.dimensions_available} types encountered{t.thin_dimensions>0?` - ${t.thin_dimensions} only seen once`:''}</div>
   </div>)}</div>}
 </section>
}
