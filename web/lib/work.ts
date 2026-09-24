const API=process.env.NEXT_PUBLIC_DOJO_API ?? 'http://127.0.0.1:8000';
export async function createWorkItem(input:{kind?:string;title:string;question_ids:string[];settings?:Record<string,unknown>}){
 const r=await fetch(`${API}/work`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 if(!r.ok) throw new Error(await r.text()); return r.json();
}
export async function updateWorkItem(id:string,status:'in_progress'|'completed'|'marking'|'marked'){
 const r=await fetch(`${API}/work/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
 if(!r.ok) throw new Error(await r.text()); return r.json();
}
