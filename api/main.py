from __future__ import annotations
import json, os, random, sqlite3, uuid
import stripe
from pathlib import Path
from functools import lru_cache
from typing import Any
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query, Request, Header
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

app=FastAPI(title='DOJO API')

# --- Billing configuration ---------------------------------------------------
#
# Secrets are supplied through environment variables in local development
# and Render. Nothing sensitive is stored in source control.
#
STRIPE_SECRET_KEY=os.getenv('STRIPE_SECRET_KEY','').strip()
STRIPE_WEBHOOK_SECRET=os.getenv('STRIPE_WEBHOOK_SECRET','').strip()
DOJO_STRIPE_PRICE_ID=os.getenv(
    'DOJO_STRIPE_PRICE_ID',
    ''
).strip()

SUPABASE_URL=os.getenv(
    'SUPABASE_URL',
    ''
).strip().rstrip('/')

SUPABASE_SERVICE_ROLE_KEY=os.getenv(
    'SUPABASE_SERVICE_ROLE_KEY',
    ''
).strip()

if STRIPE_SECRET_KEY:
    stripe.api_key=STRIPE_SECRET_KEY
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

@lru_cache(maxsize=1)
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
    wanted = wanted.strip()

    # Explicit metadata scopes. These are used by Topics, Question Sets,
    # Coverage and other UI surfaces when they know exactly what they mean.
    if ':' in wanted:
        field, value = wanted.split(':', 1)
        field = field.strip().lower()
        needle = _norm(value)

        if field == 'topic':
            return _norm(str(q.get('topic') or '')) == needle

        if field == 'family':
            return _norm(str(q.get('family') or '')) == needle

        if field == 'architecture':
            return _norm(str(q.get('architecture') or '')) == needle

        if field == 'area':
            return any(
                _norm(str(v)) == needle
                for v in (q.get('areas') or [])
            )

        if field == 'technique':
            return any(
                _norm(str(v)) == needle
                for v in (q.get('techniques') or [])
            )

        return False

    # Backwards compatibility for existing links / callers.
    needle = _norm(wanted)
    values = [
        q.get('topic', ''),
        q.get('family', ''),
        q.get('architecture', '')
    ]
    values += q.get('areas') or []
    values += q.get('techniques') or []

    return any(
        needle and (
            needle == _norm(str(v))
            or needle in _norm(str(v))
            or _norm(str(v)) in needle
        )
        for v in values
    )

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


@app.get('/questions/coverage-catalogue')
def questions_coverage_catalogue():
    """
    Canonical bank inventory for Coverage.

    One row per real question architecture, grouped by topic.
    Questions without an architecture are not treated as an
    invented archetype.
    """
    qs = catalogue()
    groups = {}

    for q in qs:
        topic = str(q.get('topic') or '').strip()
        architecture = str(q.get('architecture') or '').strip()

        if not topic or not architecture:
            continue

        key = (topic, architecture)

        if key not in groups:
            groups[key] = {
                'topic': topic,
                'architecture': architecture,
                'family': str(q.get('family') or '').strip(),
                'question_ids': [],
                'question_count': 0,
            }

        groups[key]['question_ids'].append(str(q.get('id')))
        groups[key]['question_count'] += 1

    rows = sorted(
        groups.values(),
        key=lambda row: (
            row['topic'].lower(),
            row['architecture'].lower()
        )
    )

    return {
        'architectures': rows,
        'architecture_count': len(rows),
        'question_count': sum(
            row['question_count']
            for row in rows
        )
    }

class BalancedQuestionPool(BaseModel):
    label: str
    within: str | None = None
    any: list[str] = []


class BalancedQuestionRequest(BaseModel):
    pools: list[BalancedQuestionPool]
    count: int = 10
    exposure: list[str] = ['any']
    history: dict[str, int] = {}


def _exposure_matches(
    q: dict,
    exposure: list[str],
    history: dict[str, int]
) -> bool:
    if not exposure or 'any' in exposure:
        return True

    seen = int(history.get(str(q.get('id')), 0) or 0)

    if 'unseen' in exposure and seen == 0:
        return True

    if 'once' in exposure and seen == 1:
        return True

    if 'few' in exposure and 2 <= seen <= 3:
        return True

    if 'explored' in exposure and seen >= 4:
        return True

    return False


def _balanced_pool_matches(
    q: dict,
    pool: BalancedQuestionPool
) -> bool:
    # Parent/topic constraint is AND.
    if pool.within and not _scope_matches(q, pool.within):
        return False

    # Metadata scopes inside one clicked focus are OR.
    if pool.any:
        return any(
            _scope_matches(q, scope)
            for scope in pool.any
        )

    # A whole-topic selection has its topic in `any`.
    return bool(pool.within)


@app.post('/questions/select-balanced')
def questions_select_balanced(
    request: BalancedQuestionRequest
):
    count = max(1, min(int(request.count), 50))

    if not request.pools:
        raise HTTPException(
            400,
            'Choose at least one question pool'
        )

    qs = catalogue()
    rng = random.Random()

    pools = []

    for requested in request.pools:
        candidates = [
            q for q in qs
            if _balanced_pool_matches(q, requested)
            and _exposure_matches(
                q,
                request.exposure,
                request.history
            )
        ]

        # Whole topics arrive as any=['topic:X'] and no within.
        if not requested.within and requested.any:
            candidates = [
                q for q in qs
                if any(
                    _scope_matches(q, scope)
                    for scope in requested.any
                )
                and _exposure_matches(
                    q,
                    request.exposure,
                    request.history
                )
            ]

        varied = _varied_from_pool(
            candidates,
            len(candidates),
            rng
        )

        pools.append({
            'label': requested.label,
            'questions': varied
        })

    chosen = []
    used = set()

    # Round-robin across the USER'S SELECTED ITEMS, not their
    # metadata scopes. If a pool empties, its remaining share is
    # naturally redistributed amongst surviving pools.
    while len(chosen) < count:
        made_progress = False

        for pool in pools:
            questions = pool['questions']

            while (
                questions
                and str(questions[0].get('id')) in used
            ):
                questions.pop(0)

            if not questions:
                continue

            q = questions.pop(0)
            qid = str(q.get('id'))

            chosen.append(q)
            used.add(qid)
            made_progress = True

            if len(chosen) >= count:
                break

        if not made_progress:
            break

    if not chosen:
        raise HTTPException(
            404,
            'No questions match the selected pools'
        )

    return {
        'question_count': len(chosen),
        'questions': chosen,
        'pools': [
            {
                'label': pool['label'],
                'available': len(pool['questions'])
            }
            for pool in pools
        ]
    }

class SimilarQuestionRequest(BaseModel):
    seed_ids:list[str]
    count:int=10

def _similarity_to_seed(candidate:dict, seed:dict)->tuple[bool,int]:
    """
    DOJO similarity is generator-native.

    Two questions are similar when they were generated from the
    same family + architecture sub-batch.
    """

    candidate_family=_norm(str(candidate.get('family') or ''))
    seed_family=_norm(str(seed.get('family') or ''))

    candidate_architecture=_norm(
        str(candidate.get('architecture') or '')
    )
    seed_architecture=_norm(
        str(seed.get('architecture') or '')
    )

    eligible=bool(
        seed_family
        and seed_architecture
        and candidate_family == seed_family
        and candidate_architecture == seed_architecture
    )

    if not eligible:
        return False,0

    return True,1

def _question_identity(q:dict)->str:
    """
    Stable identity used for deduplication.
    """
    return str(
        q.get('id')
        or q.get('source_question_id')
        or ''
    )


def _resolve_question_id(
    qs:list[dict],
    requested_id:str
)->dict:
    """
    Resolve a question safely.

    Canonical catalogue IDs are globally unique:
        <source bank>::<source question id>

    Short source IDs such as Q000017 are accepted ONLY when they
    identify exactly one question across the entire catalogue.
    """

    requested=str(requested_id or '').strip()

    if not requested:
        raise HTTPException(
            400,
            'Question ID is required'
        )

    # Canonical ID always wins.
    exact=[
        q for q in qs
        if str(q.get('id') or '') == requested
    ]

    if len(exact) == 1:
        return exact[0]

    # Legacy short-ID compatibility, but never guess.
    source_matches=[
        q for q in qs
        if str(
            q.get('source_question_id') or ''
        ) == requested
    ]

    if len(source_matches) == 1:
        return source_matches[0]

    if len(source_matches) > 1:
        raise HTTPException(
            409,
            (
                f'Ambiguous question ID "{requested}". '
                'Use the full canonical bank question ID.'
            )
        )

    raise HTTPException(
        404,
        f'Question not found: {requested}'
    )

def _similar_pools(
    seed_ids:list[str]
)->tuple[list[dict],list[list[dict]]]:
    """
    Build one independent similarity pool per seed.

    If the selected seeds are:
      - vectors
      - integration by parts
      - quadratics

    this returns three separate pools.

    It does NOT look for questions which somehow match all three.
    """

    wanted=[
        str(x).strip()
        for x in seed_ids
        if str(x).strip()
    ]

    # Preserve selection order while removing duplicate seed IDs.
    wanted=list(dict.fromkeys(wanted))

    if not wanted:
        raise HTTPException(
            400,
            'At least one seed question is required'
        )

    qs=catalogue()

    seeds=[]

    for wanted_id in wanted:
        seed=_resolve_question_id(
            qs,
            wanted_id
        )

        seeds.append(seed)

    excluded=set(wanted)

    for seed in seeds:
        if seed.get('id'):
            excluded.add(str(seed['id']))

        if seed.get('source_question_id'):
            excluded.add(
                str(seed['source_question_id'])
            )

    rng=random.Random()
    pools=[]

    for seed in seeds:
        scored=[]

        for candidate in qs:
            qid=str(candidate.get('id') or '')
            source_id=str(
                candidate.get('source_question_id') or ''
            )

            if qid in excluded or source_id in excluded:
                continue

            eligible,score=_similarity_to_seed(
                candidate,
                seed
            )

            if eligible:
                scored.append(
                    (score,candidate)
                )

        # Randomise equal-score ordering, then strongest first.
        rng.shuffle(scored)

        scored.sort(
            key=lambda item:item[0],
            reverse=True
        )

        pools.append(
            [q for _,q in scored]
        )

    return seeds,pools


def _unique_similar_candidates(
    pools:list[list[dict]]
)->list[dict]:
    """
    Unique union of all qualifying per-seed pools.

    Used for the availability number.
    """
    seen=set()
    result=[]

    for pool in pools:
        for q in pool:
            key=_question_identity(q)

            if not key or key in seen:
                continue

            seen.add(key)
            result.append(q)

    return result


def _balanced_similar_selection(
    pools:list[list[dict]],
    count:int
)->list[dict]:
    """
    Round-robin across the independent seed pools.

    This prevents a seed with a large question family from
    overwhelming seeds which have fewer available matches.

    Duplicate candidates which occur in multiple pools are emitted
    only once.
    """

    if count <= 0:
        return []

    positions=[0 for _ in pools]
    chosen=[]
    chosen_ids=set()

    while len(chosen) < count:
        added_this_round=False

        for pool_index,pool in enumerate(pools):
            while positions[pool_index] < len(pool):
                candidate=pool[positions[pool_index]]
                positions[pool_index] += 1

                key=_question_identity(candidate)

                if not key or key in chosen_ids:
                    continue

                chosen.append(candidate)
                chosen_ids.add(key)
                added_this_round=True
                break

            if len(chosen) >= count:
                break

        if not added_this_round:
            break

    return chosen


@app.post('/questions/similar')
def questions_similar(body:SimilarQuestionRequest):
    requested=max(
        1,
        min(int(body.count),50)
    )

    seeds,pools=_similar_pools(
        body.seed_ids
    )

    unique_candidates=_unique_similar_candidates(
        pools
    )

    available=len(unique_candidates)

    chosen=_balanced_similar_selection(
        pools,
        min(requested,available)
    )

    return {
        'seed_ids':[
            str(q.get('id'))
            for q in seeds
            if q.get('id')
        ],
        'available':available,
        'requested':requested,
        'question_count':len(chosen),
        'questions':chosen
    }


@app.post('/questions/similar/count')
def questions_similar_count(body:SimilarQuestionRequest):
    seeds,pools=_similar_pools(
        body.seed_ids
    )

    candidates=_unique_similar_candidates(
        pools
    )

    return {
        'seed_ids':[
            str(q.get('id'))
            for q in seeds
            if q.get('id')
        ],
        'available':len(candidates),
        'available_by_seed':[
            {
                'seed_id':str(seed.get('id') or ''),
                'available':len(pool)
            }
            for seed,pool in zip(seeds,pools)
        ]
    }


class SimilarSeedAllocation(BaseModel):
    seed_id:str
    count:int


class SimilarAllocationRequest(BaseModel):
    allocations:list[SimilarSeedAllocation]


@app.post('/questions/similar/allocated')
def questions_similar_allocated(
    body:SimilarAllocationRequest
):
    allocations=[
        item for item in body.allocations
        if item.seed_id.strip() and item.count > 0
    ]

    if not allocations:
        return {
            'question_count':0,
            'questions':[],
            'allocations':[]
        }

    seed_ids=[
        item.seed_id.strip()
        for item in allocations
    ]

    seeds,pools=_similar_pools(seed_ids)

    pool_by_seed={}

    for seed,pool in zip(seeds,pools):
        qid=str(seed.get('id') or '')
        source_id=str(
            seed.get('source_question_id') or ''
        )

        if qid:
            pool_by_seed[qid]=pool

        if source_id:
            pool_by_seed[source_id]=pool

    chosen=[]
    chosen_ids=set()
    summary=[]

    for item in allocations:
        seed_id=item.seed_id.strip()
        requested=max(0,min(int(item.count),50))
        pool=pool_by_seed.get(seed_id,[])

        created=0

        for candidate in pool:
            if created >= requested:
                break

            key=_question_identity(candidate)

            if not key or key in chosen_ids:
                continue

            chosen.append(candidate)
            chosen_ids.add(key)
            created += 1

        summary.append({
            'seed_id':seed_id,
            'requested':requested,
            'created':created,
            'available':len(pool)
        })

    return {
        'question_count':len(chosen),
        'questions':chosen,
        'allocations':summary
    }

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

class BulkQuestionRequest(BaseModel):
    ids:list[str]


@app.post('/questions/bulk')
def questions_bulk(body:BulkQuestionRequest):
    """
    Resolve multiple question IDs against one catalogue build.

    Results preserve request order. Duplicate requested IDs are
    returned once. Missing IDs are reported separately rather than
    causing the entire request to fail.
    """
    requested=list(dict.fromkeys(
        str(qid).strip()
        for qid in body.ids
        if str(qid).strip()
    ))

    if not requested:
        return {
            'questions':[],
            'missing':[]
        }

    if len(requested) > 500:
        raise HTTPException(
            400,
            'A maximum of 500 question IDs may be requested at once'
        )

    qs=catalogue()

    questions=[]
    missing=[]

    for qid in requested:
        try:
            questions.append(
                _resolve_question_id(qs,qid)
            )
        except HTTPException as exc:
            if exc.status_code == 404:
                missing.append(qid)
                continue

            raise

    return {
        'questions':questions,
        'missing':missing
    }


@app.get('/questions/{qid:path}')
def question(qid:str):
    return _resolve_question_id(
        catalogue(),
        qid
    )

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


# --- Billing ----------------------------------------------------------------

class BillingRequest(BaseModel):
    return_url: str


class BetaCodeRequest(BaseModel):
    code: str


def _supabase_headers(
    bearer_token: str | None = None
) -> dict[str, str]:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(
            503,
            'Supabase server configuration is not set.'
        )

    return {
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': (
            'Bearer '
            + (
                bearer_token
                if bearer_token
                else SUPABASE_SERVICE_ROLE_KEY
            )
        ),
        'Content-Type': 'application/json'
    }


def _supabase_request(
    method: str,
    path: str,
    *,
    bearer_token: str | None = None,
    payload: Any = None,
    extra_headers: dict[str, str] | None = None
) -> Any:
    data = None

    if payload is not None:
        data = json.dumps(payload).encode('utf-8')

    headers = _supabase_headers(bearer_token)

    if extra_headers:
        headers.update(extra_headers)

    req = urllib.request.Request(
        SUPABASE_URL + path,
        data=data,
        method=method,
        headers=headers
    )

    try:
        with urllib.request.urlopen(
            req,
            timeout=20
        ) as response:
            raw = response.read().decode('utf-8')

            if not raw:
                return None

            return json.loads(raw)

    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(
            'utf-8',
            errors='replace'
        )

        raise HTTPException(
            exc.code,
            'Supabase request failed: ' + detail[:500]
        )


def _bearer_token(
    authorization: str | None
) -> str:
    value = str(authorization or '').strip()

    if not value.lower().startswith('bearer '):
        raise HTTPException(
            401,
            'Authentication required.'
        )

    token = value[7:].strip()

    if not token:
        raise HTTPException(
            401,
            'Authentication required.'
        )

    return token


def _authenticated_user(
    authorization: str | None
) -> dict:
    token = _bearer_token(authorization)

    user = _supabase_request(
        'GET',
        '/auth/v1/user',
        bearer_token=token
    )

    if (
        not isinstance(user, dict)
        or not user.get('id')
    ):
        raise HTTPException(
            401,
            'Authentication required.'
        )

    return user


def _membership_for_user(
    user_id: str
) -> dict | None:
    encoded = urllib.parse.quote(
        user_id,
        safe=''
    )

    rows = _supabase_request(
        'GET',
        (
            '/rest/v1/memberships'
            '?select=*'
            '&user_id=eq.'
            + encoded
            + '&limit=1'
        )
    )

    if isinstance(rows, list) and rows:
        return rows[0]

    return None


def _upsert_membership(
    user_id: str,
    values: dict
) -> None:
    payload = {
        'user_id': user_id,
        **values,
        'updated_at': datetime.now(
            timezone.utc
        ).isoformat()
    }

    _supabase_request(
        'POST',
        '/rest/v1/memberships?on_conflict=user_id',
        payload=payload,
        extra_headers={
            'Prefer': 'resolution=merge-duplicates'
        }
    )


def _stripe_ready(
    *,
    webhook: bool = False
) -> None:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(
            503,
            'Stripe is not configured.'
        )

    if (
        not DOJO_STRIPE_PRICE_ID
        and not webhook
    ):
        raise HTTPException(
            503,
            'DOJO Stripe price is not configured.'
        )

    if (
        webhook
        and not STRIPE_WEBHOOK_SECRET
    ):
        raise HTTPException(
            503,
            'Stripe webhook is not configured.'
        )


def _safe_return_url(
    value: str
) -> str:
    url = str(value or '').strip()

    if not url:
        raise HTTPException(
            400,
            'Return URL is required.'
        )

    for origin in ALLOWED_ORIGINS:
        clean = origin.rstrip('/')

        if (
            url == clean
            or url.startswith(clean + '/')
        ):
            return url

    raise HTTPException(
        400,
        'Return URL is not allowed.'
    )


def _stripe_customer_id_for_user(
    user: dict
) -> str:
    user_id = str(user['id'])
    membership = _membership_for_user(
        user_id
    )

    existing = str(
        (membership or {}).get(
            'stripe_customer_id'
        )
        or ''
    ).strip()

    if existing:
        return existing

    customer = stripe.Customer.create(
        email=user.get('email'),
        metadata={
            'dojo_user_id': user_id
        }
    )

    customer_id = str(customer['id'])

    _upsert_membership(
        user_id,
        {
            'stripe_customer_id': customer_id
        }
    )

    return customer_id


@app.post('/billing/redeem-beta')
def redeem_beta_code(
    body: BetaCodeRequest,
    authorization: str | None = Header(
        default=None
    )
):
    user = _authenticated_user(
        authorization
    )

    user_id = str(user['id'])
    code = body.code.strip().upper()

    if not code:
        raise HTTPException(
            400,
            'Enter a beta access code.'
        )

    encoded_code = urllib.parse.quote(
        code,
        safe=''
    )

    rows = _supabase_request(
        'GET',
        (
            '/rest/v1/beta_codes'
            '?select=id,code,is_active,expires_at,max_redemptions'
            '&code=eq.'
            + encoded_code
            + '&limit=1'
        )
    )

    if not isinstance(rows, list) or not rows:
        raise HTTPException(
            400,
            'That beta access code is not valid.'
        )

    beta_code = rows[0]

    if not beta_code.get('is_active'):
        raise HTTPException(
            400,
            'That beta access code is no longer active.'
        )

    expires_at = beta_code.get('expires_at')

    if expires_at:
        expiry = datetime.fromisoformat(
            str(expires_at).replace(
                'Z',
                '+00:00'
            )
        )

        if expiry <= datetime.now(timezone.utc):
            raise HTTPException(
                400,
                'That beta access code has expired.'
            )

    existing = _supabase_request(
        'GET',
        (
            '/rest/v1/beta_code_redemptions'
            '?select=id,beta_code_id'
            '&user_id=eq.'
            + urllib.parse.quote(
                user_id,
                safe=''
            )
            + '&limit=1'
        )
    )

    if isinstance(existing, list) and existing:
        existing_code_id = str(
            existing[0].get('beta_code_id')
            or ''
        )

        if existing_code_id != str(
            beta_code['id']
        ):
            raise HTTPException(
                409,
                'This account has already redeemed beta access.'
            )
    else:
        max_redemptions = beta_code.get(
            'max_redemptions'
        )

        if max_redemptions is not None:
            redemptions = _supabase_request(
                'GET',
                (
                    '/rest/v1/beta_code_redemptions'
                    '?select=id'
                    '&beta_code_id=eq.'
                    + urllib.parse.quote(
                        str(beta_code['id']),
                        safe=''
                    )
                )
            )

            count = (
                len(redemptions)
                if isinstance(redemptions, list)
                else 0
            )

            if count >= int(max_redemptions):
                raise HTTPException(
                    400,
                    'That beta access code has reached its limit.'
                )

        _supabase_request(
            'POST',
            '/rest/v1/beta_code_redemptions',
            payload={
                'beta_code_id': str(
                    beta_code['id']
                ),
                'user_id': user_id
            }
        )

    membership = (
        _membership_for_user(user_id)
        or {}
    )

    if (
        membership.get('status') == 'member'
        and membership.get(
            'stripe_subscription_id'
        )
    ):
        return {
            'ok': True,
            'status': 'member',
            'source': 'stripe',
            'message': (
                'This account already has an active '
                'DOJO membership.'
            )
        }

    _upsert_membership(
        user_id,
        {
            'status': 'member',
            'access_source': 'beta'
        }
    )

    return {
        'ok': True,
        'status': 'member',
        'source': 'beta',
        'message': 'Beta access activated.'
    }


@app.post('/billing/checkout')
def billing_checkout(
    body: BillingRequest,
    authorization: str | None = Header(
        default=None
    )
):
    _stripe_ready()

    user = _authenticated_user(
        authorization
    )

    user_id = str(user['id'])

    membership = _membership_for_user(
        user_id
    )

    if (
        membership
        and membership.get('status') == 'member'
        and membership.get(
            'stripe_subscription_id'
        )
    ):
        raise HTTPException(
            409,
            'This account already has a DOJO membership.'
        )

    customer_id = (
        _stripe_customer_id_for_user(user)
    )

    return_url = _safe_return_url(
        body.return_url
    )

    session = (
        stripe.checkout.Session.create(
            mode='subscription',
            customer=customer_id,
            line_items=[
                {
                    'price': DOJO_STRIPE_PRICE_ID,
                    'quantity': 1
                }
            ],
            success_url=(
                return_url
                + '?checkout=success'
            ),
            cancel_url=(
                return_url
                + '?checkout=cancelled'
            ),
            client_reference_id=user_id,
            subscription_data={
                'metadata': {
                    'dojo_user_id': user_id
                }
            },
            allow_promotion_codes=False
        )
    )

    return {
        'url': session.url
    }


@app.post('/billing/portal')
def billing_portal(
    body: BillingRequest,
    authorization: str | None = Header(
        default=None
    )
):
    _stripe_ready()

    user = _authenticated_user(
        authorization
    )

    membership = _membership_for_user(
        str(user['id'])
    )

    customer_id = str(
        (membership or {}).get(
            'stripe_customer_id'
        )
        or ''
    ).strip()

    if not customer_id:
        raise HTTPException(
            404,
            'No Stripe billing account exists yet.'
        )

    return_url = _safe_return_url(
        body.return_url
    )

    session = (
        stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url
        )
    )

    return {
        'url': session.url
    }


def _stripe_user_id(
    subscription: dict
) -> str | None:
    metadata = (
        subscription.get('metadata')
        or {}
    )

    user_id = str(
        metadata.get('dojo_user_id')
        or ''
    ).strip()

    if user_id:
        return user_id

    customer_id = str(
        subscription.get('customer')
        or ''
    ).strip()

    if not customer_id:
        return None

    encoded = urllib.parse.quote(
        customer_id,
        safe=''
    )

    rows = _supabase_request(
        'GET',
        (
            '/rest/v1/memberships'
            '?select=user_id'
            '&stripe_customer_id=eq.'
            + encoded
            + '&limit=1'
        )
    )

    if isinstance(rows, list) and rows:
        value = str(
            rows[0].get('user_id')
            or ''
        )

        return value or None

    return None


def _sync_stripe_subscription(
    subscription: dict
) -> None:
    user_id = _stripe_user_id(
        subscription
    )

    if not user_id:
        raise RuntimeError(
            'Stripe subscription has no DOJO user.'
        )

    stripe_status = str(
        subscription.get('status')
        or ''
    )

    has_access = stripe_status in {
        'active',
        'trialing',
        'past_due'
    }

    items = (
        subscription.get('items')
        or {}
    ).get('data') or []

    period_end = subscription.get(
        'current_period_end'
    )

    # Newer Stripe subscription payloads can expose the
    # billing period on the subscription item instead of
    # the subscription itself.
    if not period_end and items:
        period_end = items[0].get(
            'current_period_end'
        )

    period_end_iso = None

    if period_end:
        period_end_iso = (
            datetime.fromtimestamp(
                int(period_end),
                tz=timezone.utc
            ).isoformat()
        )

    price_id = None

    if items:
        price_id = str(
            (items[0].get('price') or {})
            .get('id')
            or ''
        ) or None

    _upsert_membership(
        user_id,
        {
            'status': (
                'member'
                if has_access
                else 'trial'
            ),
            'stripe_customer_id': (
                str(
                    subscription.get(
                        'customer'
                    )
                    or ''
                )
                or None
            ),
            'stripe_subscription_id': (
                str(
                    subscription.get('id')
                    or ''
                )
                or None
            ),
            'stripe_price_id': price_id,
            'current_period_end': (
                period_end_iso
            ),
            # Stripe may represent a scheduled cancellation
            # either with cancel_at_period_end or a concrete
            # cancel_at timestamp.
            'cancel_at_period_end': bool(
                subscription.get(
                    'cancel_at_period_end'
                )
                or subscription.get('cancel_at')
            )
        }
    )


@app.post('/billing/webhook')
async def billing_webhook(
    request: Request
):
    _stripe_ready(webhook=True)

    payload = await request.body()

    signature = request.headers.get(
        'stripe-signature'
    )

    if not signature:
        raise HTTPException(
            400,
            'Missing Stripe signature.'
        )

    try:
        event = (
            stripe.Webhook.construct_event(
                payload,
                signature,
                STRIPE_WEBHOOK_SECRET
            )
        )
    except Exception:
        raise HTTPException(
            400,
            'Invalid Stripe webhook.'
        )

    event_type = str(
        event.get('type')
        or ''
    )

    if event_type in {
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted'
    }:
        subscription = dict(
            event['data']['object']
        )

        _sync_stripe_subscription(
            subscription
        )

    return {
        'received': True
    }


# --- Ask DOJO ---------------------------------------------------------------
from pydantic import BaseModel
import urllib.request
import urllib.error
import urllib.parse

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
        'question':q.get('question'),
        'answer':q.get('answer'),
        'solution':q.get('solution'),
    }

    instructions=(
        'You are SENSEI, a maths assistant inside DOJO. '

        'The student is working with an A-level maths question. '
        'The question, answer and reviewed solution are supplied to you as background context. '

        'Treat this information as context only. Do not refer to, apply, continue, or reveal '
        'anything from the supplied question or solution unless the student\'s request explicitly '
        'calls for it. '

        'Respond to the student\'s message according to what they are actually asking. '
        'If they ask a general or conceptual question, answer it generally without connecting '
        'it back to the supplied question. '

        'If they explicitly ask about the supplied question, use the supplied question, answer '
        'and reviewed solution as the authoritative context. '

        'Use the conversation so far for continuity. '

        'When using mathematical notation from the supplied context, interpret the intended '
        'mathematics and write it using clean, standard LaTeX rather than copying malformed, '
        'corrupted, or presentation-specific source notation. '

        'Write mathematical notation using $...$ for inline mathematics and $$...$$ '
        'for displayed mathematics.'
    )
    instructions += (
        '\n\nBACKGROUND CONTEXT — supplied by DOJO, not by the student:\n'
        + json.dumps(context,ensure_ascii=False)
    )

    items=[
        {'role':m.role,'content':m.content}
        for m in body.messages
        if m.role in ('user','assistant') and m.content.strip()
    ]
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
    return {'text':'\n'.join(pieces).strip(),'sensei_version':'minimal-context-v1'}

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
    rng=random.Random(seed); pool=list(catalogue()); rng.shuffle(pool)
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


