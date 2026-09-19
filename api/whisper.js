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
        voice:'coral',
        input:text,
        instructions:'Speak in a very soft, intimate ASMR-style whisper. Stay calm and understated even when the words are excited, angry, or written in all caps. Never shout. Use a close, breathy, soothing delivery, with natural pacing and very gentle emphasis.',
        response_format:'mp3'
      }),
      signal:AbortSignal.timeout(30000)
    });
    if(!r.ok){
      const detail=await r.text();
      console.error('OpenAI TTS error',r.status,detail);
      if(r.status===401||r.status===403)return res.status(502).json({error:'The whisper service rejected the OpenAI API key.'});
      if(r.status===429)return res.status(429).json({error:'Inside Voice temporarily hit its whisper limit.'});
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