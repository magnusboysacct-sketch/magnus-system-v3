// src/lib/portalErrors.ts
//
// supabase.functions.invoke returns data=null and a generic message ("Edge Function returned a
// non-2xx status code") for any non-2xx response; the server's own {error:"..."} text is in
// error.context (the Response). Use this to show that message instead of the generic one.
export async function functionErrorMessage(err:any,data:any,fallback:string):Promise<string>{
  try{
    if(data?.error)return String(data.error);
    const ctx=err?.context;
    if(ctx&&typeof ctx.json==="function"){const b=await ctx.json();if(b?.error)return String(b.error);}
  }catch{}
  return fallback;
}
