'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

type PaperArea = 'Pure' | 'Statistics' | 'Mechanics';
type Level = 'A-level' | 'AS';
type ExamBoard = 'Edexcel' | 'AQA' | 'OCR A' | 'OCR MEI';
type PastPaper = 'paper1' | 'paper2' | 'paper3';

const examBoardPapers:Record<
  ExamBoard,
  Record<Level, {id:PastPaper; label:string}[]>
>={
  Edexcel:{
    'A-level':[
      {id:'paper1',label:'Paper 1 - Pure Mathematics 1'},
      {id:'paper2',label:'Paper 2 - Pure Mathematics 2'},
      {id:'paper3',label:'Paper 3 - Statistics & Mechanics'}
    ],
    AS:[
      {id:'paper1',label:'Paper 1 - Pure Mathematics'},
      {id:'paper2',label:'Paper 2 - Statistics & Mechanics'}
    ]
  },
  AQA:{
    'A-level':[
      {id:'paper1',label:'Paper 1 - Pure'},
      {id:'paper2',label:'Paper 2 - Pure & Mechanics'},
      {id:'paper3',label:'Paper 3 - Pure & Statistics'}
    ],
    AS:[
      {id:'paper1',label:'Paper 1'},
      {id:'paper2',label:'Paper 2'}
    ]
  },
  'OCR A':{
    'A-level':[
      {id:'paper1',label:'Component 1 - Pure Mathematics'},
      {id:'paper2',label:'Component 2 - Pure Mathematics & Statistics'},
      {id:'paper3',label:'Component 3 - Pure Mathematics & Mechanics'}
    ],
    AS:[
      {id:'paper1',label:'Component 1 - Pure Mathematics & Statistics'},
      {id:'paper2',label:'Component 2 - Pure Mathematics & Mechanics'}
    ]
  },
  'OCR MEI':{
    'A-level':[
      {id:'paper1',label:'Component 1 - Pure Mathematics & Mechanics'},
      {id:'paper2',label:'Component 2 - Pure Mathematics & Statistics'},
      {id:'paper3',label:'Component 3 - Pure Mathematics & Comprehension'}
    ],
    AS:[
      {id:'paper1',label:'Component 1 - Pure Mathematics & Mechanics'},
      {id:'paper2',label:'Component 2 - Pure Mathematics & Statistics'}
    ]
  }
};

type PastPaperLog={
  id:string;
  board:ExamBoard;
  level:Level;
  paper:PastPaper;
  year:number;
  score:number;
  available:number;
  flagged:string[];
  notes:string;
};

type LogDraft={
  score:string;
  available:string;
  flagged:string;
  notes:string;
};

const sampleYears = [2025, 2024, 2023, 2022, 2021, 2020];

const AQA_ALEVEL_RESOURCES =
  'https://www.aqa.org.uk/subjects/mathematics/a-level/mathematics-7357/assessment-resources';

const AQA_AS_RESOURCES =
  'https://www.aqa.org.uk/subjects/mathematics/as-level/mathematics-7356/assessment-resources';

function pearsonPastPaperUrl(level:Level,year:number){
  const qualificationFamily =
    level === 'A-level'
      ? 'A-Level'
      : 'AS-and-A-Level';

  return (
    'https://qualifications.pearson.com/en/support/support-topics/exams/past-papers.html' +
    '?Exam-Series=' + encodeURIComponent(`June-${year}`) +
    '&Qualification-Family=' + encodeURIComponent(qualificationFamily) +
    '&Qualification-Subject=' + encodeURIComponent('Mathematics (2017)') +
    '&Specification-Code=' +
    encodeURIComponent(
      'Pearson-UK:Specification-Code/maths-2017-as-al'
    ) +
    '&Status=' +
    encodeURIComponent('Pearson-UK:Status/Live')
  );
}

function officialPaperResourceUrl(
  board:ExamBoard,
  level:Level,
  year:number
){
  if(board === 'AQA'){
    return level === 'A-level'
      ? AQA_ALEVEL_RESOURCES
      : AQA_AS_RESOURCES;
  }

  if(board === 'Edexcel'){
    return pearsonPastPaperUrl(level,year);
  }

  return null;
}

export default function PapersPage() {
  const [section, setSection] = useState<'past' | 'generate' | null>(null);
  const [level, setLevel] = useState<Level>('A-level');
  const [examBoard, setExamBoard] = useState<ExamBoard>('Edexcel');
  const [pastPaper, setPastPaper] = useState<PastPaper>('paper1');
  const [area, setArea] = useState<PaperArea>('Pure');
  const [marks, setMarks] = useState('Full paper');
  const [examMode, setExamMode] = useState(true);
  const [advanced, setAdvanced] = useState(false);
  const [askDojo, setAskDojo] = useState(true);
  const [solutions, setSolutions] = useState(true);
  const [timer, setTimer] = useState(false);
  const [freeNav, setFreeNav] = useState(true);
  const [savedPapers, setSavedPapers] = useState<any[]>([]);

  const [paperHistoryView,setPaperHistoryView]=
    useState<'active'|'archived'>('active');
  const [papersLoading, setPapersLoading] = useState(true);
  const [pastPaperLogs,setPastPaperLogs]=
    useState<PastPaperLog[]>([]);

  const [logsLoading,setLogsLoading]=
    useState(false);

  const [editingLog,setEditingLog]=
    useState<string|null>(null);

  const [logDraft,setLogDraft]=
    useState<LogDraft>({
      score:'',
      available:'',
      flagged:'',
      notes:''
    });

  const [logSaving,setLogSaving]=
    useState(false);

  const [logError,setLogError]=
    useState('');

  const [loggedIn,setLoggedIn]=
    useState<boolean|null>(null);

  const [authNotice,setAuthNotice]=
    useState('');

  useEffect(()=>{
    let active=true;

    supabase.auth.getUser()
      .then(({data})=>{
        if(active){
          setLoggedIn(Boolean(data.user));
        }
      })
      .catch(()=>{
        if(active){
          setLoggedIn(false);
        }
      });

    return()=>{
      active=false;
    };
  },[]);

  function requireAccount(message:string){
    setAuthNotice(message);
  }

  useEffect(() => {
    let active = true;

    async function loadSavedPapers() {
      setPapersLoading(true);

      const { data: auth } = await supabase.auth.getUser();

      if (!auth.user) {
        if (active) {
          setSavedPapers([]);
          setPapersLoading(false);
        }
        return;
      }

      let savedPapersQuery = supabase
        .from('work_items')
        .select('id,title,status,settings,created_at,updated_at,completed_at,marked_at,archived_at')
        .eq('user_id', auth.user.id)
        .eq('kind', 'generated_paper');

      savedPapersQuery =
        paperHistoryView === 'archived'
          ? savedPapersQuery.not('archived_at', 'is', null)
          : savedPapersQuery.is('archived_at', null);

      const { data, error } = await savedPapersQuery
        .order('updated_at', { ascending: false })
        .limit(3);

      if (error || !data) {
        if (active) {
          setSavedPapers([]);
          setPapersLoading(false);
        }
        return;
      }

      const paperIds = data.map((paper) => paper.id);

      const { data: markedQuestions } = paperIds.length
        ? await supabase
            .from('work_questions')
            .select('work_id,marks_awarded,marks_available')
            .in('work_id', paperIds)
        : { data: [] };

      const papersWithScores = data.map((paper) => {
        const questionMarks = (markedQuestions ?? []).filter(
          (question) => question.work_id === paper.id
        );

        const score = questionMarks.reduce(
          (sum, question) => sum + Number(question.marks_awarded ?? 0),
          0
        );

        const available = questionMarks.reduce(
          (sum, question) => sum + Number(question.marks_available ?? 0),
          0
        );

        return {
          ...paper,
          score,
          available,
        };
      });

      if (active) {
        setSavedPapers(papersWithScores);
        setPapersLoading(false);
      }
    }

    loadSavedPapers();

    return () => {
      active = false;
    };
  }, [section, paperHistoryView]);

  async function archiveSavedPaper(id:string){
    const {data:auth}=await supabase.auth.getUser();

    if(!auth.user) return;

    const {error}=await supabase
      .from('work_items')
      .update({
        archived_at:new Date().toISOString()
      })
      .eq('id',id)
      .eq('user_id',auth.user.id);

    if(error){
      console.error('Could not remove paper from view:',error);
      return;
    }

    setSavedPapers(current =>
      current.filter(paper => paper.id !== id)
    );
  }

  async function restoreSavedPaper(id:string){
    const {data:auth}=await supabase.auth.getUser();

    if(!auth.user) return;

    const {error}=await supabase
      .from('work_items')
      .update({archived_at:null})
      .eq('id',id)
      .eq('user_id',auth.user.id);

    if(error){
      console.error('Could not restore paper:',error);
      return;
    }

    setSavedPapers(current =>
      current.filter(paper => paper.id !== id)
    );
  }

  useEffect(()=>{
    let active=true;

    async function loadPastPaperLogs(){
      setLogsLoading(true);

      const {data:auth}=await supabase.auth.getUser();

      if(!auth.user){
        if(active){
          setPastPaperLogs([]);
          setLogsLoading(false);
        }
        return;
      }

      const {data,error}=await supabase
        .from('work_items')
        .select('id,settings,updated_at')
        .eq('user_id',auth.user.id)
        .eq('kind','past_paper')
        .order('updated_at',{ascending:false});

      if(!active) return;

      if(error){
        console.error(error);
        setPastPaperLogs([]);
        setLogsLoading(false);
        return;
      }

      const rows:PastPaperLog[]=(data ?? [])
        .map((row:any)=>{
          const settings=row.settings ?? {};

          return {
            id:String(row.id),
            board:(settings.board ?? 'Edexcel') as ExamBoard,
            level:settings.level as Level,
            paper:settings.paper as PastPaper,
            year:Number(settings.year),
            score:Number(settings.score),
            available:Number(settings.available),
            flagged:Array.isArray(settings.flagged)
              ? settings.flagged.map(String)
              : [],
            notes:String(settings.notes ?? '')
          };
        })
        .filter(
          (row:PastPaperLog)=>
            Boolean(row.level) &&
            Boolean(row.paper) &&
            Number.isFinite(row.year)
        );

      setPastPaperLogs(rows);
      setLogsLoading(false);
    }

    loadPastPaperLogs();

    return ()=>{
      active=false;
    };
  },[]);

  function logKey(
    targetBoard:ExamBoard,
    targetLevel:Level,
    targetPaper:PastPaper,
    year:number
  ){
    return `${targetBoard}-${targetLevel}-${targetPaper}-${year}`;
  }

  function findLog(
    targetBoard:ExamBoard,
    targetLevel:Level,
    targetPaper:PastPaper,
    year:number
  ){
    return pastPaperLogs.find(
      row=>
        row.board===targetBoard &&
        row.level===targetLevel &&
        row.paper===targetPaper &&
        row.year===year
    );
  }

  function selectedPaperLabel(){
    return (
      examBoardPapers[examBoard][level]
        .find(item=>item.id===pastPaper)?.label ??
      'Paper'
    );
  }

  function resetPastPaperSelection(
    nextBoard:ExamBoard,
    nextLevel:Level
  ){
    const first=examBoardPapers[nextBoard][nextLevel][0];
    setPastPaper(first?.id ?? 'paper1');
    setEditingLog(null);
    setLogError('');
  }

  function beginLog(year:number){
    if(loggedIn===false){
      requireAccount(
        'Create an account to log paper results, flags and notes.'
      );
      return;
    }

    const key=logKey(examBoard,level,pastPaper,year);
    const existing=findLog(examBoard,level,pastPaper,year);

    setEditingLog(key);
    setLogError('');

    setLogDraft({
      score:existing ? String(existing.score) : '',
      available:existing ? String(existing.available) : '',
      flagged:existing
        ? existing.flagged.join(', ')
        : '',
      notes:existing?.notes ?? ''
    });
  }

  async function savePastPaperLog(year:number){
    setLogError('');

    const score=Number(logDraft.score);

    const available=
      level==='A-level'
        ? 100
        : Number(logDraft.available);

    if(
      !Number.isFinite(score) ||
      !Number.isFinite(available) ||
      score<0 ||
      available<=0 ||
      score>available
    ){
      setLogError(
        level==='A-level'
          ? 'Enter a valid score from 0 to 100.'
          : 'Enter a valid score and total marks.'
      );
      return;
    }

    const flagged=logDraft.flagged
      .split(',')
      .map(value=>value.trim())
      .filter(Boolean)
      .map(value=>
        /^q/i.test(value)
          ? value.toUpperCase()
          : `Q${value}`
      );

    const existing=findLog(
      examBoard,
      level,
      pastPaper,
      year
    );

    const {data:auth,error:authError}=
      await supabase.auth.getUser();

    if(authError || !auth.user){
      setLogError(
        'You must be logged in to save a paper result.'
      );
      return;
    }

    setLogSaving(true);

    try{
      const settings={
        board:examBoard,
        level,
        paper:pastPaper,
        year,
        score,
        available,
        flagged,
        notes:logDraft.notes.trim(),

        // Grade calculation will be added when real
        // boundaries are supplied.
        grade:null
      };

      let saved:any;

      if(existing){
        const {data,error}=await supabase
          .from('work_items')
          .update({
            title:`${level} ${year} ${
              pastPaper==='paper1'
                ? 'Paper 1'
                : pastPaper==='paper2'
                  ? 'Paper 2'
                  : 'Paper 3'
            }`,
            status:'marked',
            settings,
            marked_at:new Date().toISOString(),
            updated_at:new Date().toISOString()
          })
          .eq('id',existing.id)
          .eq('user_id',auth.user.id)
          .select('id,settings')
          .single();

        if(error) throw error;
        saved=data;
      }else{
        const now=new Date().toISOString();

        const {data,error}=await supabase
          .from('work_items')
          .insert({
            user_id:auth.user.id,
            kind:'past_paper',
            title:`${level} ${year} ${
              pastPaper==='paper1'
                ? 'Paper 1'
                : pastPaper==='paper2'
                  ? 'Paper 2'
                  : 'Paper 3'
            }`,
            status:'marked',
            settings,
            completed_at:now,
            marked_at:now,
            updated_at:now
          })
          .select('id,settings')
          .single();

        if(error) throw error;
        saved=data;
      }

      const next:PastPaperLog={
        id:String(saved.id),
        board:examBoard,
        level,
        paper:pastPaper,
        year,
        score,
        available,
        flagged,
        notes:logDraft.notes.trim()
      };

      setPastPaperLogs(current=>{
        const without=current.filter(
          row=>!(
            row.board===examBoard &&
            row.level===level &&
            row.paper===pastPaper &&
            row.year===year
          )
        );

        return [next,...without];
      });

      setEditingLog(null);
    }catch(error:any){
      console.error(error);

      setLogError(
        error?.message ??
        'Could not save this paper result.'
      );
    }finally{
      setLogSaving(false);
    }
  }
  return (
    <main className="papers-page">
      {section === null && (
        <>
          <div className="page-kicker">A-level Mathematics</div>

          <h1>Papers</h1>

          <p className="page-intro">
            Sit a past paper or generate a fresh exam-style paper.
          </p>
        </>
      )}

      {authNotice && authNotice!=='generate-paper' && (
        <div
          style={{
            margin:'18px 0',
            padding:'14px 16px',
            border:'1px solid #d9d9d9',
            borderRadius:'8px',
            background:'#fff',
            display:'flex',
            justifyContent:'space-between',
            alignItems:'center',
            gap:'16px',
            flexWrap:'wrap'
          }}
        >
          <span>{authNotice}</span>

          <span
            style={{
              display:'flex',
              gap:'12px',
              flexShrink:0
            }}
          >
            <Link
              href="/login?next=%2Fpapers"
              style={{fontWeight:700,color:'inherit'}}
            >
              Log in
            </Link>

            <Link
              href="/signup?next=%2Fpapers"
              style={{fontWeight:700,color:'inherit'}}
            >
              Create account →
            </Link>
          </span>
        </div>
      )}

      {!section && (
        <div className="paper-entry-grid">
          <button
            className="paper-entry-card"
            onClick={() => setSection('past')}
          >
            <span className="paper-entry-title">
              Past Papers
            </span>

            <span className="paper-entry-copy">
              Browse real Edexcel exam papers by level, area and year.
            </span>

            <span className="paper-entry-action">
              Browse papers
            </span>
          </button>

          <button
            className="paper-entry-card"
            onClick={() => setSection('generate')}
          >
            <span className="paper-entry-title">
              DOJO Papers
            </span>

            <span className="paper-entry-copy">
              Create a fresh paper from DOJO questions.
            </span>

            <span className="paper-entry-action">
              Create paper
            </span>
          </button>
        </div>
      )}

      {section === 'past' && (
        <section className="paper-section">
          <button
            className="paperSectionBack"
            onClick={() => setSection(null)}
          >
            <span className="paperSectionBackArrow" aria-hidden="true" />
            Back to Papers
          </button>

          <div className="section-heading-row">
            <div>
              <h2>Past Papers</h2>
              <p>
          Create a full exam style paper from DOJO questions or complete a past paper
        </p>
            </div>
          </div>

          <div className="pastPaperSelectorBlock">
            <div className="pastPaperSelectorLabel">Exam board</div>
            <div className="choice-row">
              {(['Edexcel','AQA','OCR A','OCR MEI'] as ExamBoard[]).map((board)=>(
                <button
                  key={board}
                  type="button"
                  className={`choice-pill ${
                    examBoard===board ? 'active' : ''
                  }`}
                  onClick={()=>{
                    setExamBoard(board);
                    resetPastPaperSelection(board,level);
                  }}
                >
                  {board}
                </button>
              ))}
            </div>
          </div>

          <div className="pastPaperSelectorBlock">
            <div className="pastPaperSelectorLabel">Qualification</div>
            <div className="choice-row">
              {(['A-level', 'AS'] as Level[]).map((x) => (
                <button
                  key={x}
                  className={`choice-pill ${
                    level === x ? 'active' : ''
                  }`}
                  onClick={()=>{
                    setLevel(x);
                    resetPastPaperSelection(examBoard,x);
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="pastPaperSelectorBlock">
            <div className="pastPaperSelectorLabel">
              {examBoard.startsWith('OCR') ? 'Component' : 'Paper'}
            </div>
            <div className="choice-row secondary">
              {examBoardPapers[examBoard][level].map(({id,label}) => (
                <button
                  key={id}
                  className={`choice-pill ${pastPaper === id ? 'active' : ''}`}
                  onClick={() => {
                    setPastPaper(id);
                    setEditingLog(null);
                    setLogError('');
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loggedIn===false && (
            <div
              style={{
                margin:'0 0 14px',
                padding:'12px 14px',
                border:'1px solid #e1e1e1',
                borderRadius:'8px',
                background:'#fafafa',
                fontSize:'13px',
                color:'#666'
              }}
            >
              Past papers are open to browse. Create an account
              to log scores, flagged questions and notes.
            </div>
          )}

          <div className="past-paper-list">
            {sampleYears.map((year)=>{
              const existing=
                findLog(examBoard,level,pastPaper,year);

              const key=
                logKey(examBoard,level,pastPaper,year);

              const editing=
                editingLog===key;

              return (
                <div
                  className="past-paper-row"
                  key={year}
                  style={{
                    alignItems:'start',
                    flexWrap:'wrap'
                  }}
                >
                  <div className="paper-year">
                    {year}
                  </div>

                  <div
                    className="paper-name"
                    style={{
                      flex:'1 1 360px'
                    }}
                  >
                    <strong>
                      {examBoard}
                      {' - '}
                      {level}
                      {' - '}
                      {selectedPaperLabel()}
                    </strong>

                    {logsLoading ? (
                      <div
                        style={{
                          marginTop:'5px',
                          opacity:.55,
                          fontSize:'13px'
                        }}
                      >
                        Loading record...
                      </div>
                    ) : existing ? (
                      <div
                        style={{
                          marginTop:'6px',
                          display:'flex',
                          gap:'12px',
                          flexWrap:'wrap',
                          fontSize:'13px'
                        }}
                      >
                        <span>
                          {existing.score}
                          /
                          {existing.available}
                          {' · '}
                          {Math.round(
                            (
                              existing.score /
                              existing.available
                            ) * 100
                          )}
                          %
                        </span>

                        <span>
                          Grade: N/A
                        </span>

                        {existing.flagged.length>0 && (
                          <span>
                            Flagged:{' '}
                            {existing.flagged.join(', ')}
                          </span>
                        )}

                        {existing.notes && (
                          <span>
                            Notes saved
                          </span>
                        )}
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop:'5px',
                          opacity:.55,
                          fontSize:'13px'
                        }}
                      >
                        No result logged
                      </div>
                    )}
                  </div>

                  {(examBoard==='AQA' || examBoard==='Edexcel') && (
                    <div className="pastPaperResourceActions">
                      <a
                        className="paperResourceLink"
                        href={
                          officialPaperResourceUrl(
                            examBoard,
                            level,
                            year
                          ) ?? '#'
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {examBoard==='AQA'
                          ? 'Official AQA resources'
                          : 'Question paper & mark scheme'}
                        <span
                          className="paperResourceExternal"
                          aria-hidden="true"
                        >
                          &nearr;
                        </span>
                      </a>

                      {examBoard==='Edexcel' &&
                        level==='A-level' &&
                        pastPaper==='paper3' && (
                          <span className="paperResourceHint">
                            Statistics and Mechanics are separate
                            Pearson booklets.
                          </span>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="paper-open"
                    onClick={()=>
                      editing
                        ? setEditingLog(null)
                        : beginLog(year)
                    }
                  >
                    {editing
                      ? 'Cancel'
                      : existing
                        ? 'Edit log'
                        : 'Log result'}
                  </button>

                  {editing && (
                    <div
                      style={{
                        flexBasis:'100%',
                        marginTop:'14px',
                        padding:'18px',
                        borderTop:
                          '1px solid rgba(0,0,0,.08)',
                        display:'grid',
                        gap:'14px'
                      }}
                    >
                      <div
                        style={{
                          display:'grid',
                          gridTemplateColumns:
                            level==='A-level'
                              ? 'minmax(0,220px)'
                              : 'repeat(2,minmax(0,180px))',
                          gap:'12px'
                        }}
                      >
                        <label
                          style={{
                            display:'grid',
                            gap:'6px'
                          }}
                        >
                          <strong>
                            Your score
                          </strong>

                          <div
                            style={{
                              display:'flex',
                              alignItems:'center',
                              gap:'9px'
                            }}
                          >
                            <input
                              type="number"
                              min="0"
                              max={
                                level==='A-level'
                                  ? 100
                                  : undefined
                              }
                              value={logDraft.score}
                              onChange={event=>
                                setLogDraft(current=>({
                                  ...current,
                                  score:event.target.value
                                }))
                              }
                              style={{
                                width:'110px',
                                padding:'10px',
                                font:'inherit'
                              }}
                            />

                            {level==='A-level' && (
                              <strong
                                style={{
                                  fontSize:'16px',
                                  opacity:.65
                                }}
                              >
                                / 100
                              </strong>
                            )}
                          </div>
                        </label>

                        {level==='AS' && (
                          <label
                            style={{
                              display:'grid',
                              gap:'6px'
                            }}
                          >
                            <strong>
                              Paper total
                            </strong>

                            <input
                              type="number"
                              min="1"
                              value={logDraft.available}
                              onChange={event=>
                                setLogDraft(current=>({
                                  ...current,
                                  available:event.target.value
                                }))
                              }
                              style={{
                                padding:'10px',
                                font:'inherit'
                              }}
                            />
                          </label>
                        )}
                      </div>
                      <label
                        style={{
                          display:'grid',
                          gap:'6px'
                        }}
                      >
                        <strong>
                          Flagged questions
                        </strong>

                        <input
                          type="text"
                          value={logDraft.flagged}
                          placeholder="e.g. 4, 7, 12"
                          onChange={event=>
                            setLogDraft(current=>({
                              ...current,
                              flagged:event.target.value
                            }))
                          }
                          style={{
                            padding:'10px',
                            font:'inherit'
                          }}
                        />

                        <small style={{opacity:.55}}>
                          Separate question numbers with commas.
                        </small>
                      </label>

                      <label
                        style={{
                          display:'grid',
                          gap:'6px'
                        }}
                      >
                        <strong>Notes</strong>

                        <textarea
                          value={logDraft.notes}
                          placeholder="Anything you want to remember about this paper..."
                          onChange={event=>
                            setLogDraft(current=>({
                              ...current,
                              notes:event.target.value
                            }))
                          }
                          rows={4}
                          style={{
                            padding:'10px',
                            resize:'vertical',
                            font:'inherit'
                          }}
                        />
                      </label>

                      {logError && (
                        <div
                          style={{
                            fontSize:'13px',
                            fontWeight:700
                          }}
                        >
                          {logError}
                        </div>
                      )}

                      <div>
                        <button
                          type="button"
                          className="primary-paper-action"
                          disabled={logSaving}
                          onClick={()=>
                            savePastPaperLog(year)
                          }
                        >
                          {logSaving
                            ? 'Saving...'
                            : existing
                              ? 'Update result'
                              : 'Save result'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="quiet-note">
            {examBoard==='AQA' ? (
              <>
                Papers and mark schemes open on AQA&apos;s official
                assessment-resources page in a new tab. Keep DOJO open
                to record your result afterwards.
              </>
            ) : examBoard==='Edexcel' ? (
              <>
                Papers and mark schemes open in Pearson&apos;s official
                past-paper finder in a new tab. Keep DOJO open to record
                your result afterwards.
              </>
            ) : (
              <>
                DOJO can still record your score, flagged questions and
                notes for this paper.
              </>
            )}
          </p>
        </section>
      )}

      {section === 'generate' && (
        <section className="paper-section">
          <button
            className="paperSectionBack"
            onClick={() => setSection(null)}
          >
            <span className="paperSectionBackArrow" aria-hidden="true" />
            Back to Papers
          </button>

          <h2>DOJO Papers</h2>

          <p>
            Choose the basics and start. More control is available
            only if you want it.
          </p>

          <div className="builder-block">
            <label>Content</label>

            <div className="choice-row compact">
              {(
                ['Pure', 'Statistics', 'Mechanics'] as PaperArea[]
              ).map((x) => (
                <button
                  key={x}
                  className={`choice-pill ${
                    area === x ? 'active' : ''
                  }`}
                  onClick={() => setArea(x)}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="builder-block">
            <label>Paper length</label>

            <div className="choice-row compact">
              {[
                '40 marks',
                '60 marks',
                '80 marks',
                'Full paper',
              ].map((x) => (
                <button
                  key={x}
                  className={`choice-pill ${
                    marks === x ? 'active' : ''
                  }`}
                  onClick={() => setMarks(x)}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>

          <div className="exam-mode-row">
            <div>
              <strong>Exam mode</strong>

              <span>
                Hide solutions and feedback until the paper is
                finished.
              </span>
            </div>

            <button
              className={`toggle-button ${
                examMode ? 'on' : ''
              }`}
              onClick={() =>
                setExamMode((value) => !value)
              }
              aria-pressed={examMode}
            >
              <span />
            </button>
          </div>

          <button
            className="advanced-trigger"
            onClick={() => {
              if(loggedIn!==false){
                setAdvanced((value) => !value);
              }
            }}
          >
            <span className="paperAdvancedTitle">
              Advanced options

              {loggedIn===false && (
                <span className="paperAccountRequired">
                  Account required
                </span>
              )}
            </span>

            <span>
              {loggedIn===false ? '-' : advanced ? '-' : '+'}
            </span>
          </button>

          {(advanced || loggedIn===false) && (
            <div
              className={
                loggedIn===false
                  ? 'advanced-panel paper-advanced-panel paperAdvancedLocked'
                  : 'advanced-panel paper-advanced-panel'
              }
            >
              {(!examMode || loggedIn===false) && (
                <div className="paper-workspace-options">
                  <div className="paper-workspace-heading">
                    <strong>Workspace</strong>

                    <span>
                      Choose what is available while you work
                      through the paper.
                    </span>
                  </div>

                  <div className="paper-workspace-grid">
                    {[
                      [
                        'SENSEI',
                        'AI chat alongside the paper',
                        askDojo,
                        setAskDojo,
                      ],
                      [
                        'Solutions',
                        'Answer, mark scheme and full solution',
                        solutions,
                        setSolutions,
                      ],
                      [
                        'Timer',
                        'Show elapsed working time',
                        timer,
                        setTimer,
                      ],
                      [
                        'Free navigation',
                        'Move freely around the paper',
                        freeNav,
                        setFreeNav,
                      ],
                    ].map(
                      ([
                        label,
                        detail,
                        value,
                        setter,
                      ]: any) => (
                        <label
                          className="paper-workspace-switch"
                          key={label}
                        >
                          <span>
                            <strong>{label}</strong>
                            <small>{detail}</small>
                          </span>

                          <input
                            type="checkbox"
                            checked={value}
                            disabled={loggedIn===false}
                            onChange={(event) =>
                              setter(
                                event.target.checked
                              )
                            }
                          />

                          <i />
                        </label>
                      )
                    )}
                  </div>
                </div>
              )}

              {examMode && loggedIn!==false && (
                <div className="paper-exam-note">
                  Exam mode uses the exam workspace:
                  solutions and SENSEI stay hidden until the
                  paper is finished.
                </div>
              )}
            </div>
          )}

          {loggedIn===false ? (
            <div className="paperGenerateLoggedOut">
              <button
                type="button"
                className="primary-paper-action"
                onClick={()=>
                  requireAccount(
                    'generate-paper'
                  )
                }
              >
                Generate {area} paper
              </button>

              {authNotice==='generate-paper' && (
                <div className="paperGenerateAccountPrompt">
                  <div className="paperAccountPromptCopy">
                    <div className="paperAccountEyebrow">
                      SAVE AND MARK YOUR PAPER
                    </div>

                    <strong>
                      Create a free account to generate this paper
                    </strong>

                    <p>
                      Generate your paper, return to unfinished work
                      and keep your results in DOJO.
                    </p>
                  </div>

                  <div className="paperAccountActions">
                    <Link
                      href="/signup?next=%2Fpapers"
                      className="paperAccountCreate"
                    >
                      Create free account
                    </Link>

                    <Link
                      href="/login?next=%2Fpapers"
                      className="paperAccountLogin"
                    >
                      Log in
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="primary-paper-action"
              onClick={(event) => {
                event.currentTarget.disabled = true;
                const generationId =
                  typeof crypto !== 'undefined' &&
                  typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random()
                        .toString(36)
                        .slice(2)}`;

                const params = new URLSearchParams({
                  level:'A-level',
                  area,
                  marks:
                    marks === 'Full paper'
                      ? '100'
                      : marks.split(' ')[0],
                  examMode: examMode ? '1' : '0',
                  askDojo:
                    !examMode && askDojo ? '1' : '0',
                  solutions:
                    !examMode && solutions ? '1' : '0',
                  timer:
                    !examMode && timer ? '1' : '0',
                  freeNav:
                    !examMode && freeNav ? '1' : '0',
                  generationId,
                });

                window.location.assign(
                  `/papers/generated?${params.toString()}`
                );
              }}
            >
              Generate {area} paper
            </button>
          )}

          <div className="paper-history">
            <div className="history-heading">
              <h3>Your papers</h3>
              {loggedIn!==false && (
                <Link href="/papers/history">
                  View all papers
                </Link>
              )}
            </div>

            {loggedIn !== false && (
              <div className="paperArchiveTabs">
                <button
                  type="button"
                  className={paperHistoryView === 'active' ? 'active' : ''}
                  onClick={() => setPaperHistoryView('active')}
                >
                  Active
                </button>

                <button
                  type="button"
                  className={paperHistoryView === 'archived' ? 'active' : ''}
                  onClick={() => setPaperHistoryView('archived')}
                >
                  Archived
                </button>
              </div>
            )}

            {loggedIn===false ? (
              <div className="paperHistoryAccountPrompt">
                <div className="paperAccountPromptCopy">
                  <div className="paperAccountEyebrow">
                    YOUR PAPERS
                  </div>

                  <strong>
                    Keep your generated papers and results
                  </strong>

                  <p>
                    Save generated papers, return to unfinished work,
                    mark them later and keep your results in DOJO.
                  </p>
                </div>

                <div className="paperAccountActions">
                  <Link
                    href="/signup?next=%2Fpapers"
                    className="paperAccountCreate"
                  >
                    Create free account
                  </Link>

                  <Link
                    href="/login?next=%2Fpapers"
                    className="paperAccountLogin"
                  >
                    Log in
                  </Link>
                </div>
              </div>
            ) : papersLoading ? (
              <p className="empty-history">Loading papers...</p>
            ) : savedPapers.length === 0 ? (
              <p className="empty-history">
                {paperHistoryView === 'archived'
                  ? 'Papers hidden from view in Latest will appear here.'
                  : 'Generated papers and results will appear here as you use DOJO.'}
              </p>
            ) : (
              <div className="past-paper-list">
                {savedPapers.map((paper) => {
                  const elapsed = Number(paper.settings?.elapsedSeconds ?? 0);
                  const minutes = Math.floor(elapsed / 60);
                  const seconds = elapsed % 60;

                  return (
                    <div className="past-paper-row" key={paper.id}>
                      <div className="paper-year">
                        {String(paper.settings?.paper?.area ?? 'Paper')}
                      </div>

                      <div className="paper-name">
                        <strong>{paper.title}</strong>
                        {elapsed > 0 && (
                          <span>
                            {' - '}
                            {minutes}:{String(seconds).padStart(2, '0')}
                          </span>
                        )}

                        <span>
                          {' - '}
                          {paper.status === 'marked' && paper.available > 0
                            ? `${paper.score}/${paper.available} (${Math.round(
                                (paper.score / paper.available) * 100
                              )}%)`
                            : paper.status === 'marking'
                              ? 'Marking'
                              : 'Finished'}
                        </span>
                      </div>

                      <Link
                        className="paper-open"
                        href={
                          paper.status === 'marked'
                            ? `/practice?work=${encodeURIComponent(paper.id)}`
                            : `/practice?work=${encodeURIComponent(paper.id)}&mode=mark`
                        }
                      >
                        {paper.status === 'marked'
                          ? 'View result'
                          : paper.status === 'marking'
                            ? 'Continue marking'
                            : 'Mark paper'}
                      </Link>
                      <details className="paperItemMenu">
                        <summary
                          aria-label="Paper options"
                          title="Options"
                        >
                          ⋯
                        </summary>
                        <div className="paperItemMenuPopup">
                          <button
                            type="button"
                            onClick={() =>
                              paperHistoryView === 'archived'
                                ? restoreSavedPaper(paper.id)
                                : archiveSavedPaper(paper.id)
                            }
                          >
                            {paperHistoryView === 'archived'
                              ? 'Restore to view'
                              : 'Remove from view'}
                          </button>
                        </div>
                      </details>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
