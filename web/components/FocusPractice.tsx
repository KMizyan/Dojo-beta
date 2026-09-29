'use client';

import {useState} from 'react';
import {practiceCategory} from '../lib/topics';
import type {FocusGroup} from '../lib/topics';

export default function FocusPractice({
  topic,
  groups,
  available
}:{
  topic:string;
  groups:FocusGroup[];
  available:boolean;
}){
  const [open,setOpen]=useState<string|null>(null);

  const start=(focus:string)=>{
    const category=practiceCategory(focus);

    if(!category) return;

    const x=new URLSearchParams({
      topic,
      topics:category.any.join(','),
      count:'10',
      selection:'mixed',
      mode:'practice',
      focus,
      ask:'1',
      solutions:'1',
      timer:'0',
      freeNav:'1'
    });

    x.set('within',category.within);

    location.href=`/practice?${x}`;
  };

  return (
    <div className="focusGrid">
      {groups.map(group=>{
        const expanded=open===group.label;
        const mappedSkills=group.skills.filter(skill=>practiceCategory(skill));
        const groupCategory=practiceCategory(group.label);

        const hasDirectMapping=!!groupCategory;
        const hasMappedSkills=mappedSkills.length>0;
        const groupAvailable=available&&(hasDirectMapping||hasMappedSkills);
        const hasChoices=group.skills.length>1;

        return (
          <div
            className={`focusCard ${expanded?'focusCardOpen':''}`}
            key={group.label}
          >
            <button
              className="focusMain"
              onClick={()=>{
                if(!groupAvailable) return;

                if(hasChoices){
                  setOpen(expanded?null:group.label);
                }else{
                  start(group.skills[0]);
                }
              }}
              disabled={!groupAvailable}
            >
              <span>
                <b>{group.label}</b>

                {group.description&&(
                  <small>{group.description}</small>
                )}

                {!groupAvailable&&(
                  <small>Not yet available</small>
                )}
              </span>

              <span className="focusArrow">
                {!groupAvailable
                  ? ''
                  : hasChoices
                    ? (expanded?'−':'+')
                    : '→'}
              </span>
            </button>

            {expanded&&(
              <div className="focusChoices">
                {hasDirectMapping&&(
                  <button onClick={()=>start(group.label)}>
                    Mixed {group.label.toLowerCase()}
                  </button>
                )}

                {group.skills.map(skill=>{
                  const mapped=!!practiceCategory(skill);

                  return (
                    <button
                      key={skill}
                      onClick={()=>mapped&&start(skill)}
                      disabled={!mapped}
                    >
                      {skill}{!mapped?' — Not yet available':''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
