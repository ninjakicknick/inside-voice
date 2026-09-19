export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only.'});
  const apiKey=process.env.OPENAI_API_KEY;
  if(!apiKey)return res.status(500).json({error:'Inside Voice is missing its OpenAI API key.'});
  const text=String(req.body?.text||'').replace(/\s+/g,' ').trim();
  if(!text)return res.status(400).json({error:'Nothing to whisper.'});
  if(text.length>1200)return res.status(400).json({error:'That caption is too long to whisper.'});
  try{
    const r=await fetch('https://api.openai.com/v1/audio/speech',{
      method:'POST',
      headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-4o-mini-tts',
        voice:'shimmer',
        input:text,
        instructions:'Speak in an extremely quiet, close-mic ASMR whisper. Do not use a normal speaking voice. Use almost no vocal projection: breathy, hushed, slow, intimate, and soothing. Imagine someone is asleep beside you and you absolutely must not wake them. Even when the text contains yelling, excitement, anger, exclamation points, or ALL CAPS, stay calm and nearly monotone. Never become energetic, theatrical, or loud. Keep the delivery soft and sleepy, with small relaxed pauses between phrases and only the gentlest emphasis.',
        response_format:'mp3'
      }),
      signal:AbortSignal.timeout(30000)
    });
    if(!r.ok){
      const detail=await r.text();
      console.error('OpenAI TTS error',r.status,detail);
      let parsed={};try{parsed=JSON.parse(detail)}catch{}
      const code=parsed?.error?.code||parsed?.error?.type||'';
      if(r.status===401||r.status===403)return res.status(502).json({error:'The whisper service rejected the OpenAI API key.'});
      if(r.status===429){
        if(/credit_balance_exhausted|insufficient_quota/i.test(code))return res.status(429).json({error:'The OpenAI API account has no available credit. Add API billing/credits, then try again.'});
        if(/spend_limit_exceeded|usage_limit_exceeded/i.test(code))return res.status(429).json({error:'The OpenAI API account has reached its spending or usage limit.'});
        const retryAfter=r.headers.get('retry-after');
        return res.status(429).json({error:retryAfter?'The whisper service is rate-limited. Try again in about '+retryAfter+' seconds.':'The whisper service is being rate-limited. Try again shortly.'});
      }
      return res.status(502).json({error:'The whisper service could not generate this line.'});
    }
    const audio=Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Cache-Control','private, max-age=3600');
    return res.status(200).send(audio);
  }catch(error){
    console.error('Whisper TTS request failed',error);
    return res.status(502).json({error:'Inside Voice could not reach the whisper service.'});
  }
}