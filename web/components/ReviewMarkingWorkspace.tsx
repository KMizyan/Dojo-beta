'use client';

import { useEffect, useState } from 'react';
import {
  AskDojo,
  QuestionDisplay,
  SolutionTools
} from './PracticeSession';

type Tab = 'answer' | 'markscheme' | 'solution';

export default function ReviewMarkingWorkspace({
  q,
  index
}:{
  q:any;
  index:number;
}) {
  const [senseiActive,setSenseiActive]=useState(false);
  const [tab,setTab]=useState<Tab>('answer');

  const questionKey=String(
    q?.id ??
    q?.question_id ??
    q?.ref ??
    ''
  );

  useEffect(()=>{
    setSenseiActive(false);
    setTab('answer');
  },[questionKey]);

  return (
    <div className="main practiceShell">
      <section className="practiceSession">
        <div className="questionWorkspace">
      <div className="questionColumn">
        <div className="questionPaper edexcelPaper">
          <div className="paperQuestionNumber">
            {index+1}.
          </div>

          <div className="questionBody">
            <QuestionDisplay q={q}/>
          </div>

          {Number(q?.marks)>0 && (
            <div className="paperMarks">
              ({q.marks})
            </div>
          )}
        </div>

        {senseiActive && (
          <div className="markingInlineSolutions">
            <SolutionTools
              q={q}
              tab={tab}
              setTab={setTab}
            />
          </div>
        )}
      </div>

      <aside className="markingReferenceColumn">
        <div
          className={
            senseiActive
              ? 'markingRightSolutions markingRightSolutionsHidden'
              : 'markingRightSolutions'
          }
        >
          <SolutionTools
            q={q}
            tab={tab}
            setTab={setTab}
          />
        </div>

        <div
          className={
            senseiActive
              ? 'dojoColumn'
              : 'dojoColumn markingSenseiCompactMode'
          }
        >
          <div className="dojoColumnHeading">
            <b>SENSEI</b>
            <span>
              {senseiActive
                ? `Question ${index+1}`
                : ''}
            </span>
          </div>

          <AskDojo
            q={q}
            onFirstSubmit={()=>{
              setSenseiActive(true);
            }}
          />
        </div>
      </aside>
        </div>
      </section>
    </div>
  );
}
