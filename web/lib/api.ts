const API=process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

let topicsPromise:Promise<any[]>|null=null;
const topicPromises=new Map<string,Promise<any>>();

export async function getTopics(){
  if(!topicsPromise){
    topicsPromise=(
      async ()=>{
        const r=await fetch(
          `${API}/topics`
        );

        if(!r.ok){
          throw new Error(
            'Could not load topics.'
          );
        }

        return await r.json();
      }
    )().catch(error=>{
      topicsPromise=null;
      throw error;
    });
  }

  try{
    return await topicsPromise;
  }catch{
    return [];
  }
}

export async function getTopic(name:string){
  const key=String(name).trim();

  if(!key) return null;

  let request=topicPromises.get(key);

  if(!request){
    request=(
      async ()=>{
        const r=await fetch(
          `${API}/topics/${encodeURIComponent(key)}`
        );

        if(!r.ok){
          throw new Error(
            'Could not load topic.'
          );
        }

        return await r.json();
      }
    )().catch(error=>{
      topicPromises.delete(key);
      throw error;
    });

    topicPromises.set(
      key,
      request
    );
  }

  try{
    return await request;
  }catch{
    return null;
  }
}
export async function selectQuestions(
  topics:string[],
  count:number,
  within?:string
){
  try{
    const p=new URLSearchParams();
    topics.forEach(t=>p.append('topics',t));
    p.set('count',String(count));
    if(within) p.set('within',within);

    const r=await fetch(`${API}/questions/select?${p.toString()}`,{cache:'no-store'});
    if(!r.ok)throw new Error();
    return await r.json();
  }catch{return null}
}

export async function selectBalancedQuestionPools(
  pools:{
    label:string;
    within?:string;
    any:string[];
  }[],
  count:number,
  exposures:string[],
  history:Record<string,number>
){
  try{
    const r=await fetch(`${API}/questions/select-balanced`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        pools,
        count,
        exposure:exposures,
        history
      })
    });

    if(!r.ok){
      throw new Error(
        await r.text() ||
        'Could not build this question set.'
      );
    }

    return await r.json();
  }catch(error){
    throw error;
  }
}
export async function selectQuestionsWithExposure(
  topics:string[],
  count:number,
  exposures:string[],
  history:Record<string,number>,
  within?:string
){
  try{
    const r=await fetch(`${API}/questions/select`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        topics,
        count,
        within,
        exposure:exposures,
        history
      })
    });

    if(!r.ok) return null;
    return await r.json();
  }catch{
    return null;
  }
}


export async function getSimilarQuestionCount(
  seedIds:string[]
){
  try{
    const r=await fetch(
      `${API}/questions/similar/count`,
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          seed_ids:seedIds,
          count:1
        })
      }
    );

    if(!r.ok) return null;

    return await r.json();
  }catch{
    return null;
  }
}
export async function selectSimilarQuestions(
  seedIds:string[],
  count:number
){
  try{
    const r=await fetch(`${API}/questions/similar`,{
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        seed_ids:seedIds,
        count
      })
    });

    if(!r.ok) return null;

    return await r.json();
  }catch{
    return null;
  }
}
export async function getQuestionsBulk(
  ids:string[]
):Promise<any[]>{
  const unique=[
    ...new Set(
      ids
        .map(id=>String(id).trim())
        .filter(Boolean)
    )
  ];

  if(!unique.length) return [];

  const r=await fetch(
    `${API}/questions/bulk`,
    {
      method:'POST',
      headers:{
        'Content-Type':'application/json'
      },
      body:JSON.stringify({
        ids:unique
      })
    }
  );

  if(!r.ok){
    throw new Error(
      'Could not load questions.'
    );
  }

  const payload=await r.json();

  return Array.isArray(payload?.questions)
    ? payload.questions
    : [];
}

export async function getQuestion(id:string){
  try{
    const r=await fetch(`${API}/questions/${encodeURIComponent(id)}`,{cache:'no-store'});
    if(!r.ok)throw new Error();
    return await r.json();
  }catch{return null}
}
export function matchBankTopic(displayName:string, topics:any[]){
  const norm=(s:string)=>s.toLowerCase().replace(/a-level/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  const wanted=norm(displayName);
  return topics.find(t=>{const n=norm(t.name);return n===wanted || n.includes(wanted) || wanted.includes(n)})?.name ?? null;
}


export async function selectAllocatedSimilarQuestions(
  allocations:{seed_id:string;count:number}[]
){
  const r=await fetch(
    `${API}/questions/similar/allocated`,
    {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({allocations})
    }
  );

  if(!r.ok){
    throw new Error(
      await r.text() ||
      'Could not create similar practice set.'
    );
  }

  return await r.json();
}

let coverageCataloguePromise:Promise<any>|null=null;

export async function getCoverageCatalogue(){
  if(!coverageCataloguePromise){
    coverageCataloguePromise=(
      async ()=>{
        const r=await fetch(
          `${API}/questions/coverage-catalogue`
        );

        if(!r.ok){
          throw new Error(
            'Could not load the question architecture catalogue.'
          );
        }

        return await r.json();
      }
    )().catch(error=>{
      coverageCataloguePromise=null;
      throw error;
    });
  }

  return coverageCataloguePromise;
}