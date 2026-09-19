export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only.'});
  const apiKey=process.env.ELEVENLABS_API_KEY;
  if(!apiKey)return res.status(500).json({error:'Inside Voice is missing its ElevenLabs API key.'});
  const text=String(req.body?.text||'').replace(/\s+/g,' ').trim();
  if(!text)return res.status(400).json({error:'Nothing to whisper.'});
  if(text.length>1200)return res.status(400).json({error:'That caption is too long to whisper.'});

  // Rachel is a stable premade ElevenLabs voice. ELEVENLABS_VOICE_ID lets us
  // audition a dedicated ASMR library voice later without another code change.
  const voiceId=process.env.ELEVENLABS_VOICE_ID||'21m00Tcm4TlvDq8ikWAM';
  const whispered='[whispers] '+text.toLowerCase();

  try{
    const r=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=mp3_44100_128',{
      method:'POST',
      headers:{'xi-api-key':apiKey,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body:JSON.stringify({
        text:whispered,
        model_id:'eleven_v3'
      }),
      signal:AbortSignal.timeout(30000)
    });
    if(!r.ok){
      const detail=await r.text();
      console.error('ElevenLabs TTS error',r.status,detail);
      let parsed={};try{parsed=JSON.parse(detail)}catch{}
      const message=parsed?.detail?.message||parsed?.detail?.status||'';
      if(r.status===401||r.status===403)return res.status(502).json({error:'ElevenLabs rejected the API key or voice access.'});
      if(r.status===429)return res.status(429).json({error:'ElevenLabs is rate-limiting Inside Voice. Try again shortly.'});
      if(/quota|credit|character/i.test(message))return res.status(402).json({error:'The ElevenLabs account needs more available credits.'});
      return res.status(502).json({error:'ElevenLabs could not generate this whisper.'});
    }
    const audio=Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type','audio/mpeg');
    res.setHeader('Cache-Control','private, max-age=3600');
    return res.status(200).send(audio);
  }catch(error){
    console.error('ElevenLabs whisper request failed',error);
    return res.status(502).json({error:'Inside Voice could not reach ElevenLabs.'});
  }
}
