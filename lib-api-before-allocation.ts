const API=process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export async function getTopics(){
  try{const r=await fetch(`${API}/topics`,{cache:'no-store'});if(!r.ok)throw new Error();return await r.json()}catch{return []}
}
export async function getTopic(name:string){
  try{const r=await fetch(`${API}/topics/${encodeURIComponent(name)}`,{cache:'no-store'});if(!r.ok)throw new Error();return await r.json()}catch{return null}
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

