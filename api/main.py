from __future__ import annotations
import json, os, random, sqlite3, uuid
from pathlib import Path
from typing import Any
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app=FastAPI(title='DOJO API')
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        'DOJO_ALLOWED_ORIGINS',
        'http://localhost:3000'
    ).split(',')
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

TOPIC_NAMES={
    'a_level_integration':'Integration','as integration':'Integration','integration':'Integration',
    'differentiation':'Differentiation','algebra_functions':'Algebra & Functions',
    'coordinate_geometry':'Coordinate Geometry','sequences_series':'Sequences & Series',
    'trigonometry':'Trigonometry','exp_logs':'Exponentials & Logarithms',
    'numerical_methods':'Numerical Methods','proofs':'Proof','proof':'Proof','vectors':'Vectors',
    'sampling':'Sampling','probability':'Probability','statistical_distributions':'Statistical Distributions',
    'hypothesis_testing':'Hypothesis Testing','kinematics':'Kinematics','moments':'Moments',
}

def content_root()->Path:
    env=os.getenv('DOJO_PROJECT_ROOT')
    candidates=[Path(env)] if env else []
    here=Path(__file__).resolve()
    candidates += [here.parent,*here.parents,Path.home()/'Documents'/'PrjDojo',Path.home()/'OneDrive'/'Documents'/'PrjDojo']
    for p in candidates:
        if p and (p/'topics').is_dir():
            return p/'topics'

    # Production: published question banks live inside this repository.
    for p in [here.parent,*here.parents]:
        published=p/'content'/'question_banks'
        if published.is_dir():
            return published

    raise RuntimeError('Could not find DOJO question banks. Set DOJO_PROJECT_ROOT locally or publish content/question_banks.')

def _items(payload:Any)->list[dict]:
    if isinstance(payload,list): return [x for x in payload if isinstance(x,dict)]
    if not isinstance(payload,dict): return []
    for k in ('questions','records','items','bank','question_bank','rendered_questions'):
        if isinstance(payload.get(k),list): return [x for x in payload[k] if isinstance(x,dict)]
    return []

def _bank_files()->list[Path]:
    content=content_root()
    rendered=sorted(content.rglob('rendered_question_bank*.json'))
    # A data directory may contain an older bank whose published file is still named question_bank*.json.
    rendered_dirs={p.parent.resolve() for p in rendered}
    fallback=[]
    for p in sorted(content.rglob('question_bank*.json')):
        if p.parent.resolve() not in rendered_dirs and p.parent.name.lower()=='data':
            fallback.append(p)
    return rendered+fallback

def _canonical_topic(path:Path)->str:
    rel=path.relative_to(content_root())
    top=rel.parts[0]
    key=top.lower().replace('-','_')
    if key in TOPIC_NAMES: return TOPIC_NAMES[key]
    spaced=top.replace('_',' ').replace('-',' ')
    if spaced.lower() in TOPIC_NAMES: return TOPIC_NAMES[spaced.lower()]
    # Nested differentiation banks all inherit Differentiation from their top-level folder.
    return spaced.title()

def _labels(meta:dict)->list[str]:
    out=[]
    primary=meta.get('primary')
    if isinstance(primary,str) and primary.strip(): out.append(primary.strip())
    tax=meta.get('pmt_taxonomy') or {}
    if isinstance(tax,dict):
        p=tax.get('primary')
        if isinstance(p,str) and p.strip(): out.append(p.strip())
        labs=tax.get('labels') or []
        if isinstance(labs,list): out += [str(x).strip() for x in labs if str(x).strip()]
    return list(dict.fromkeys(out))

def _techniques(q:dict)->list[str]:
    em=q.get('emergent_structure') or {}
    vals=[]
    for k in ('required_techniques','required_rules','cross_topic_links'):
        x=em.get(k) or []
        if isinstance(x,list): vals += [str(v) for v in x]
    return list(dict.fromkeys(vals))

def catalogue()->list[dict]:
    out=[]
    seen=set()
    for file in _bank_files():
        try: payload=json.loads(file.read_text(encoding='utf-8-sig'))
        except Exception as exc:
            print(f'DOJO: skipped unreadable bank {file}: {exc}')
            continue
        rel=file.relative_to(content_root()).as_posix()
        topic=_canonical_topic(file)
        for index,q in enumerate(_items(payload)):
            meta=q.get('topic_metadata') or {}
            gen=q.get('generative_structure') or {}
            sol=q.get('solution') or {}
            source_id=str(q.get('question_id') or q.get('id') or f'q{index+1}')
            cid=f'{rel}::{source_id}'
            if cid in seen: continue
            seen.add(cid)
            out.append({
                'id':cid,
                'source_question_id':source_id,
                'source_bank':rel,
                'topic':topic,
                'areas':_labels(meta),
                'techniques':_techniques(q),
                'family':q.get('family') or gen.get('family') or '',
                'architecture':q.get('architecture') or gen.get('architecture') or '',
                'depth':gen.get('depth_position'),
                'marks':sol.get('total_marks') or q.get('total_marks') or 4,
                'question':q.get('question') or q.get('rendered_question') or {},
                'answer':q.get('answer'),
                'solution':sol,
                'figure':q.get('figure') or {},
                'display':q.get('display') or {},
                'generative_structure':gen,
                'emergent_structure':q.get('emergent_structure') or {},
                'topic_metadata':meta,
            })
    return out

def _norm(s:str)->str:
    return ''.join(c for c in s.lower() if c.isalnum())

def _topic_matches(qtopic:str,wanted:str)->bool:
    a,b=_norm(qtopic),_norm(wanted)
    return a==b or a in b or b in a

def _scope_matches(q:dict,wanted:str)->bool:
    needle=_norm(wanted)
    values=[q.get('topic',''),q.get('family',''),q.get('architecture','')]
    values += q.get('areas') or []
    values += q.get('techniques') or []
    return any(needle and (needle==_norm(str(v)) or needle in _norm(str(v)) or _norm(str(v)) in needle) for v in values)

def _range_key(q:dict):
    family=_norm(str(q.get('family') or ''))
    architecture=_norm(str(q.get('architecture') or ''))
    areas=tuple(sorted(_norm(str(x)) for x in (q.get('areas') or []) if x))
    techniques=tuple(sorted(_norm(str(x)) for x in (q.get('techniques') or []) if x))
    return (family or architecture or (areas[0] if areas else '') or (techniques[0] if techniques else '') or _norm(q['topic']),architecture,areas,techniques)

def _varied_from_pool(pool:list[dict],count:int,rng:random.Random)->list[dict]:
    groups={}
    for q in pool: groups.setdefault(_range_key(q),[]).append(q)
    for g in groups.values(): rng.shuffle(g)
    keys=list(groups); rng.shuffle(keys); chosen=[]
    while len(chosen)<count:
        live=[k for k in keys if groups[k]]
        if not live: break
        rng.shuffle(live)
        for k in live:
            if len(chosen)>=count: break
            chosen.append(groups[k].pop())
    return chosen

def select_questions(topics:list[str],count:int,seed:str|None=None)->list[dict]:
    qs=catalogue(); wanted=[x.strip() for x in topics if x.strip()]; rng=random.Random(seed)
    if not wanted: return _varied_from_pool(qs,count,rng)
    pools=[]
    for w in wanted:
        pool=[q for q in qs if _scope_matches(q,w)]
        if pool: pools.append(_varied_from_pool(pool,count,rng))
    if not pools: return []
    chosen=[]; used=set(); i=0
    while len(chosen)<count and any(pools):
        pool=pools[i%len(pools)]
        while pool and pool[0]['id'] in used: pool.pop(0)
        if pool:
            q=pool.pop(0); chosen.append(q); used.add(q['id'])
        pools=[p for p in pools if p]; i+=1
    return chosen

@app.get('/health')
def health():
    qs=catalogue()
    return {'ok':True,'questions':len(qs),'banks':len(_bank_files())}

@app.get('/topics')
def topics():
    qs=catalogue(); names=sorted({q['topic'] for q in qs})
    return [{'name':n,'question_count':sum(q['topic']==n for q in qs)} for n in names]

@app.get('/topics/{name}')
def topic(name:str):
    qs=[q for q in catalogue() if _topic_matches(q['topic'],name)]
    if not qs: raise HTTPException(404,'Topic not found')
    return {'name':name,'question_count':len(qs),'families':sorted({q['family'] for q in qs if q['family']}),'questions':qs}

@app.get('/questions/select')
def questions_select(
    topics:list[str]=Query(default=[]),
    count:int=10,
    seed:str|None=None,
):
    count=max(1,min(int(count),50))
    qs=select_questions(topics,count,seed)
    if not qs: raise HTTPException(404,'No matching questions found')
    return {'topics':topics,'question_count':len(qs),'questions':qs}

@app.get('/questions/{qid:path}')
def question(qid:str):
    q=next((q for q in catalogue() if q['id']==qid or q['source_question_id']==qid),None)
    if not q: raise HTTPException(404,'Question not found')
    return q

# --- Persistent work items ---------------------------------------------------
DB_PATH=Path(os.getenv("DOJO_DB_PATH", str(Path(__file__).resolve().parent/"dojo.db")))

def db():
    con=sqlite3.connect(DB_PATH)
    con.row_factory=sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.execute("CREATE TABLE IF NOT EXISTS work_items(id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, settings_json TEXT NOT NULL)")
    con.execute("CREATE TABLE IF NOT EXISTS work_questions(work_id TEXT NOT NULL, position INTEGER NOT NULL, question_id TEXT NOT NULL, PRIMARY KEY(work_id,position), FOREIGN KEY(work_id) REFERENCES work_items(id) ON DELETE CASCADE)")
    con.commit()
    return con

class WorkCreate(BaseModel):
    kind:str="question_set"
    title:str="Question Set"
    question_ids:list[str]
    settings:dict[str,Any]={}

class WorkUpdate(BaseModel):
    status:str|None=None

@app.post("/work")
def create_work(body:WorkCreate):
    valid={q["id"] for q in catalogue()}
    ids=[x for x in body.question_ids if x in valid]
    if not ids: raise HTTPException(400,"No valid question IDs supplied")
    wid=str(uuid.uuid4()); now=datetime.now(timezone.utc).isoformat()
    with db() as con:
        con.execute("INSERT INTO work_items VALUES(?,?,?,?,?,?,?)",(wid,body.kind,body.title,"in_progress",now,now,json.dumps(body.settings)))
        con.executemany("INSERT INTO work_questions VALUES(?,?,?)",[(wid,i,qid) for i,qid in enumerate(ids)])
    return get_work(wid)

@app.get("/work")
def list_work():
    with db() as con:
        rows=con.execute("SELECT * FROM work_items ORDER BY updated_at DESC").fetchall()
        return [dict(r) | {"settings":json.loads(r["settings_json"])} for r in rows]

@app.get("/work/{work_id}")
def get_work(work_id:str):
    with db() as con:
        row=con.execute("SELECT * FROM work_items WHERE id=?",(work_id,)).fetchone()
        if not row: raise HTTPException(404,"Work item not found")
        ids=[r["question_id"] for r in con.execute("SELECT question_id FROM work_questions WHERE work_id=? ORDER BY position",(work_id,)).fetchall()]
    by_id={q["id"]:q for q in catalogue()}
    return dict(row) | {"settings":json.loads(row["settings_json"]),"questions":[by_id[x] for x in ids if x in by_id]}

@app.patch("/work/{work_id}")
def update_work(work_id:str,body:WorkUpdate):
    if body.status not in {"in_progress","completed","marking","marked"}: raise HTTPException(400,"Invalid status")
    now=datetime.now(timezone.utc).isoformat()
    with db() as con:
        cur=con.execute("UPDATE work_items SET status=?,updated_at=? WHERE id=?",(body.status,now,work_id))
        if not cur.rowcount: raise HTTPException(404,"Work item not found")
    return get_work(work_id)

# --- Coverage ---------------------------------------------------------------
def _coverage_keys(q:dict)->set[str]:
    keys=set()
    topic=q.get("topic")
    for area in q.get("areas") or []:
        if area: keys.add(f"area::{topic}::{area}")
    family=q.get("family")
    if family: keys.add(f"family::{topic}::{family}")
    for technique in q.get("techniques") or []:
        if technique: keys.add(f"technique::{topic}::{technique}")
    return keys

@app.get("/coverage")
def coverage():
    qs=catalogue()
    by_id={q["id"]:q for q in qs}
    try:
        with db() as con:
            attempted_ids=[r["question_id"] for r in con.execute("SELECT DISTINCT question_id FROM work_questions").fetchall()]
    except Exception:
        attempted_ids=[]
    attempted={qid for qid in attempted_ids if qid in by_id}
    result=[]
    for topic in sorted({q["topic"] for q in qs}):
        topic_qs=[q for q in qs if q["topic"]==topic]
        seen=[by_id[qid] for qid in attempted if by_id[qid]["topic"]==topic]
        available=set(); encountered=set(); counts={}
        for q in topic_qs: available |= _coverage_keys(q)
        for q in seen:
            keys=_coverage_keys(q); encountered |= keys
            for k in keys: counts[k]=counts.get(k,0)+1
        pct=round(100*len(encountered)/len(available)) if available else 0
        result.append({"topic":topic,"coverage_percent":pct,"questions_completed":len(seen),
          "dimensions_encountered":len(encountered),"dimensions_available":len(available),
          "thin_dimensions":sum(1 for k in encountered if counts.get(k,0)==1),
          "status":"covered" if pct==100 else ("in_progress" if pct else "not_started")})
    all_available=set(); all_seen=set()
    for q in qs: all_available |= _coverage_keys(q)
    for qid in attempted: all_seen |= _coverage_keys(by_id[qid])
    return {"coverage_percent":round(100*len(all_seen)/len(all_available)) if all_available else 0,
      "dimensions_encountered":len(all_seen),"dimensions_available":len(all_available),
      "questions_completed":len(attempted),"topics":result,
      "note":"Coverage measures breadth encountered, not mathematical mastery."}

# --- Ask DOJO ---------------------------------------------------------------
from pydantic import BaseModel
import urllib.request
import urllib.error

class AskDojoMessage(BaseModel):
    role:str
    content:str

class AskDojoRequest(BaseModel):
    question_id:str
    messages:list[AskDojoMessage]

def _find_dojo_question(qid:str):
    return next((q for q in catalogue() if q['id']==qid or q['source_question_id']==qid),None)

@app.post('/ask-dojo')
def ask_dojo(body:AskDojoRequest):
    key=os.getenv('OPENAI_API_KEY')
    if not key: raise HTTPException(503,'OPENAI_API_KEY is not set in the backend terminal.')
    q=_find_dojo_question(body.question_id)
    if not q: raise HTTPException(404,'Question not found')
    context={
        'question_id':q.get('id'),
        'topic':q.get('topic'),
        'areas':q.get('areas'),
        'techniques':q.get('techniques'),
        'family':q.get('family'),
        'architecture':q.get('architecture'),
        'depth':q.get('depth'),
        'marks':q.get('marks'),
        'question':q.get('question'),
        'answer':q.get('answer'),
        'solution':q.get('solution'),
        'topic_metadata':q.get('topic_metadata'),
        'generative_structure':q.get('generative_structure'),
        'emergent_structure':q.get('emergent_structure'),
    }

    instructions=(
        'You are Ask DOJO, the mathematics tutor inside DOJO, an A-level mathematics practice product. '
        'You are helping the student with exactly ONE current question. '

        'You have been given the complete DOJO record for that question, including the question, '
        'answer, worked solution, marks and structural/topic metadata. Use all of this information '
        'when it is relevant to understanding what the question is testing and how it should be solved. '

        'Treat the supplied DOJO question and reviewed solution as the authoritative mathematical '
        'context for this conversation. Do not invent a different version of the question. '

        'Respond to what the student actually asks. If they ask for a hint, give a useful next step '
        'without unnecessarily revealing the rest of the solution. If they ask for an explanation, '
        'explain the mathematical reasoning clearly. If they explicitly ask for the answer or full '
        'working, you may give it. Do not force a hint-based interaction when the student has asked '
        'for something more direct. '

        'The student may refer naturally to things such as "part a", "that step", "why did you do that", '
        '"what do I do next", or symbols appearing in the question. Use the supplied question context '
        'and the conversation so far to resolve those references. '

        'Stay focused on this question and the mathematics needed to understand it. '
        'Use language appropriate for an A-level maths student. Be concise unless more explanation '
        'is genuinely useful or the student asks for detail. '

        'Write mathematical notation using $...$ for inline mathematics and $$...$$ for displayed mathematics.'
    )
    items=[{'role':'user','content':'Current DOJO question context:\n'+json.dumps(context,ensure_ascii=False)}]
    items += [{'role':m.role,'content':m.content} for m in body.messages if m.role in ('user','assistant') and m.content.strip()]
    payload={
        'model':os.getenv('DOJO_OPENAI_MODEL','gpt-5.6-luna'),'instructions':instructions,'input':items,
        'reasoning':{'effort':'low'},'text':{'verbosity':'low'},'max_output_tokens':700,'store':False,
    }
    req=urllib.request.Request('https://api.openai.com/v1/responses',data=json.dumps(payload).encode('utf-8'),method='POST',
                               headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=45) as response: data=json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        detail=exc.read().decode(errors='replace'); raise HTTPException(502,'Ask DOJO API error: '+detail[:800])
    except Exception as exc: raise HTTPException(502,'Ask DOJO could not respond: '+str(exc))
    pieces=[]
    for item in data.get('output',[]):
        if item.get('type')=='message':
            for c in item.get('content',[]):
                if c.get('type')=='output_text' and c.get('text'): pieces.append(str(c['text']))
    if not pieces: raise HTTPException(502,'Ask DOJO returned no text.')
    return {'text':'\n'.join(pieces).strip()}

# --- Generated papers -------------------------------------------------------
PURE_PHASES=(
    {'name':'opening','share':0.25,'marks':(3,6)},
    {'name':'development','share':0.35,'marks':(4,9)},
    {'name':'later','share':0.40,'marks':(6,15)},
)

def _complexity(q:dict)->float:
    d=q.get('depth')
    try:
        x=float(d)
        if 0<=x<=1: return x
    except (TypeError,ValueError): pass
    return min(float(q.get('marks') or 4),12)/12 + min(len(q.get('techniques') or []),4)*0.12

def _build_pure_paper(target:int,seed:str|None=None)->list[dict]:
    rng=random.Random(seed); pool=catalogue(); rng.shuffle(pool)
    chosen=[]; used_types=set(); topic_counts={}; total=0
    for phase in PURE_PHASES:
        phase_goal=round(target*phase['share']); phase_start=total
        while pool and total<target and total-phase_start<phase_goal:
            remaining=target-total
            fitting=[q for q in pool if int(q.get('marks') or 4)<=remaining]
            candidates=fitting or pool
            lo,hi=phase['marks']
            def score(q):
                m=int(q.get('marks') or 4); c=_complexity(q); typ=_range_key(q); topic=q['topic']
                phase_fit=(-c if phase['name']=='opening' else c if phase['name']=='later' else -abs(c-.5))
                mark_fit=1 if lo<=m<=hi else -.3*min(abs(m-lo),abs(m-hi))
                variety=2.2 if typ not in used_types else -1.3
                breadth=1.4/(1+topic_counts.get(topic,0))
                return 2*phase_fit+mark_fit+variety+breadth+rng.random()*.05
            pick=max(candidates,key=score); m=int(pick.get('marks') or 4)
            if m>remaining: break
            chosen.append((phase['name'],pick)); total+=m
            used_types.add(_range_key(pick)); topic_counts[pick['topic']]=topic_counts.get(pick['topic'],0)+1
            pool.remove(pick)
    remaining=target-total
    if remaining>0:
        exact=[q for q in pool if int(q.get('marks') or 4)==remaining]
        if exact:
            pick=max(exact,key=_complexity); chosen.append(('later',pick))
    ordered=[]
    for phase in ('opening','development','later'):
        part=[q for p,q in chosen if p==phase]
        part.sort(key=lambda q:(_complexity(q),int(q.get('marks') or 4)))
        ordered.extend(part)
    return ordered

@app.get('/papers/generated')
def generated_paper(area:str='Pure',level:str='A-level',target_marks:int=100,seed:str|None=None):
    target_marks=max(10,min(int(target_marks),100))
    if area.lower()!='pure': raise HTTPException(400,'Structured generation is currently available for Pure papers.')
    questions=_build_pure_paper(target_marks,seed)
    if not questions: raise HTTPException(404,'No questions are available')
    total=sum(int(q.get('marks') or 4) for q in questions)
    return {'level':level,'area':area,'requested_marks':target_marks,'total_marks':total,
      'suggested_minutes':round(total*1.2),'paper_structure':'edexcel_empirical_v1',
      'exact_mark_total':total==target_marks,'questions':questions}


