'use client';
import {useState} from 'react';
import type {FocusGroup} from '../lib/topics';

export default function FocusPractice({topic,groups,available}:{topic:string;groups:FocusGroup[];available:boolean}){
  const [open,setOpen]=useState<string|null>(null);
  const start=(focus:string)=>{
    const x=new URLSearchParams({topic,count:'10',selection:'mixed',mode:'practice',focus,ask:'1',solutions:'1',timer:'0',freeNav:'1'});
    location.href=`/practice?${x}`;
  };
  return <div className="focusGrid">{groups.map(group=>{
    const expanded=open===group.label;
    const hasChoices=group.skills.length>1;
    return <div className={`focusCard ${expanded?'focusCardOpen':''}`} key={group.label}>
      <button className="focusMain" onClick={()=>hasChoices?setOpen(expanded?null:group.label):start(group.skills[0])} disabled={!available}>
        <span><b>{group.label}</b>{group.description&&<small>{group.description}</small>}</span>
        <span className="focusArrow">{hasChoices?(expanded?'−':'+'):'→'}</span>
      </button>
      {expanded&&<div className="focusChoices">
        <button onClick={()=>start(group.label)}>Mixed {group.label.toLowerCase()}</button>
        {group.skills.map(skill=><button key={skill} onClick={()=>start(skill)}>{skill}</button>)}
      </div>}
    </div>
  })}</div>;
}

