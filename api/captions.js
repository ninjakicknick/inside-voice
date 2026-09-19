import { getSubtitles } from 'youtube-caption-extractor';

export default async function handler(req,res){
  const videoID=String(req.query?.videoId||'').trim();
  if(!/^[\w-]{11}$/.test(videoID)) return res.status(400).json({error:'That does not look like a YouTube video.'});
  try{
    let subtitles;
    try{subtitles=await getSubtitles({videoID,lang:'en'});}
    catch{subtitles=await getSubtitles({videoID});}
    const cues=(subtitles||[]).map(s=>({
      time:Number(s.start??s.offset??0),
      duration:Number(s.dur??s.duration??0),
      text:String(s.text||'').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()
    })).filter(c=>Number.isFinite(c.time)&&c.text);
    if(!cues.length)return res.status(404).json({error:'No usable captions found for this video.'});
    res.setHeader('Cache-Control','s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({videoId:videoID,cues});
  }catch(error){
    console.error(error);
    return res.status(502).json({error:'YouTube would not give us captions for this one.'});
  }
}