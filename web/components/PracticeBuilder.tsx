'use client';
import {useState} from 'react';
const Sw=({label,value,set}:{label:string;value:boolean;set:(v:boolean)=>void})=><label className="advSw"><span>{label}</span><input type="checkbox" checked={value} onChange={e=>set(e.target.checked)}/><i/></label>;

export default function PracticeBuilder({topic,available}:{topic:string;available:boolean}){
  const [count,setCount]=useState(10),[advanced,setAdvanced]=useState(false),[selection,setSelection]=useState('mixed'),[mode,setMode]=useState('practice');
  const [content,setContent]=useState<'all'|'as'>('all');
  const [ask,setAsk]=useState(true),[solutions,setSolutions]=useState(true),[timer,setTimer]=useState(false),[freeNav,setFreeNav]=useState(true);
  const start=()=>{
    const x=new URLSearchParams({topic,count:String(count),selection,mode,content,ask:ask?'1':'0',solutions:solutions?'1':'0',timer:timer?'1':'0',freeNav:freeNav?'1':'0'});
    location.href=`/practice?${x}`;
  };
  return <section className="practiceBox">
    <div className="practiceTop"><div><div className="eyebrow">Whole topic practice</div><h2>Practise {topic}</h2><p>Start a mixed set across this topic.</p></div>
      <div className="quickControls"><label>Questions<select value={count} onChange={e=>setCount(+e.target.value)}><option>5</option><option>10</option><option>15</option><option>20</option></select></label><button className="primary" onClick={start} disabled={!available}>{available?'Start practice':'Questions coming soon'}</button></div>
    </div>
    <button className="advancedToggle" onClick={()=>setAdvanced(!advanced)}>Advanced {advanced?'↑':'↓'}</button>
    {advanced&&<div className="advPractice">
      <div className="advGroup"><b>Questions</b>{[['mixed','Mixed'],['unseen','Unseen'],['wrong','Previously wrong']].map(([v,l])=><label key={v}><input type="radio" name="sel" checked={selection===v} onChange={()=>setSelection(v)}/> {l}</label>)}</div>
      <div className="advGroup"><b>Content</b><small className="advHint">Use the whole topic, or keep the set to content normally available at AS.</small><label><input type="radio" name="content" checked={content==='all'} onChange={()=>setContent('all')}/> All {topic}</label><label><input type="radio" name="content" checked={content==='as'} onChange={()=>setContent('as')}/> AS content only</label></div>
      <div className="advGroup"><b>Session</b><label><input type="radio" name="mode" checked={mode==='practice'} onChange={()=>setMode('practice')}/> Practice</label><label><input type="radio" name="mode" checked={mode==='exam'} onChange={()=>setMode('exam')}/> Exam</label></div>
      <div className="advWorkspace"><b>Workspace</b><small>Choose what is available while you work.</small><div className="advSwitches"><Sw label="Ask DOJO" value={ask} set={setAsk}/><Sw label="Solutions" value={solutions} set={setSolutions}/><Sw label="Timer" value={timer} set={setTimer}/><Sw label="Free navigation" value={freeNav} set={setFreeNav}/></div></div>
    </div>}
  </section>;
}

