const API=process.env.NEXT_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export async function getTopics(){
  try{const r=await fetch(`${API}/topics`,{cache:'no-store'});if(!r.ok)throw new Error();return await r.json()}catch{return []}
}
export async function getTopic(name:string){
  try{const r=await fetch(`${API}/topics/${encodeURIComponent(name)}`,{cache:'no-store'});if(!r.ok)throw new Error();return await r.json()}catch{return null}
}
export async function selectQuestions(topics:string[],count:number){
  try{
    const p=new URLSearchParams();
    topics.forEach(t=>p.append('topics',t));
    p.set('count',String(count));
    const r=await fetch(`${API}/questions/select?${p.toString()}`,{cache:'no-store'});
    if(!r.ok)throw new Error();
    return await r.json();
  }catch{return null}
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

