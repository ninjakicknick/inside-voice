let player,timer,cues=[],lastCue=-1;
const $=id=>document.getElementById(id);
let ytReadyResolve;
const ytReady=new Promise(resolve=>ytReadyResolve=resolve);
window.onYouTubeIframeAPIReady=()=>ytReadyResolve?.();
function videoId(value){try{const u=new URL(value.trim());if(u.hostname.includes('youtu.be'))return u.pathname.slice(1).split('/')[0];if(u.pathname.includes('/shorts/'))return u.pathname.split('/shorts/')[1].split('/')[0];return u.searchParams.get('v')}catch{return /^[\w-]{11}$/.test(value.trim())?value.trim():null}}
function setStatus(text,on=false){$('status').textContent=text;document.querySelector('.status')?.classList.toggle('active',on)}
function decode(s=''){const t=document.createElement('textarea');t.innerHTML=s;return t.value}
function parseJson3(data){return (data.events||[]).filter(e=>e.segs?.length).map(e=>({time:Number(e.tStartMs||0)/1000,duration:Number(e.dDurationMs||0)/1000,text:e.segs.map(s=>s.utf8||'').join('').replace(/\s+/g,' ').trim()})).filter(c=>c.text)}
async function browserCaptions(id){
  // Experimental: ask YouTube's browser-facing player endpoint for a signed caption URL,
  // then fetch that URL from the user's browser rather than our Vercel IP.
  const playerResponse=await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({context:{client:{clientName:'WEB',clientVersion:'2.20260918.00.00',hl:'en',gl:'US'}},videoId:id})
  });
  if(!playerResponse.ok)throw new Error('Browser caption discovery was blocked ('+playerResponse.status+').');
  const data=await playerResponse.json();
  const tracks=data?.captions?.playerCaptionsTracklistRenderer?.captionTracks||[];
  const track=tracks.find(t=>t.languageCode==='en')||tracks.find(t=>t.languageCode?.startsWith('en'))||tracks[0];
  if(!track?.baseUrl)throw new Error('The browser could not find a caption track for this video.');
  const url=new URL(track.baseUrl);url.searchParams.set('fmt','json3');
  const captionResponse=await fetch(url.toString(),{credentials:'include'});
  if(!captionResponse.ok)throw new Error('The browser found captions but YouTube blocked the transcript ('+captionResponse.status+').');
  const raw=await captionResponse.text();
  if(!raw.trim())throw new Error('The browser found captions, but YouTube returned an empty transcript.');
  const parsed=parseJson3(JSON.parse(raw));
  if(!parsed.length)throw new Error('The browser received captions but could not parse them.');
  return parsed;
}
async function serverCaptions(id){const r=await fetch('/api/captions?videoId='+encodeURIComponent(id));const data=await r.json();if(!r.ok){const e=new Error(data.error||'Could not get captions');e.code=data.code;throw e}return data.cues}
async function getCaptions(id){
  try{return {cues:await browserCaptions(id),source:'browser'}}
  catch(browserError){
    console.warn('Browser caption experiment failed:',browserError);
    try{return {cues:await serverCaptions(id),source:'server'}}
    catch(serverError){
      if(serverError.code==='youtube_bot_check')throw new Error(browserError.message+' Server fallback was also challenged by YouTube.');
      throw serverError;
    }
  }
}
$('load').onclick=async()=>{
  const id=videoId($('url').value);if(!id){$('url').focus();return}
  $('stage').classList.remove('hidden');setStatus('Getting captions…');$('cue').textContent='Trying captions from this browser…';
  try{const result=await getCaptions(id);cues=result.cues;setStatus(cues.length+' caption cues ready · '+result.source);$('cue').textContent='Ready. Press play, then use your inside voice.'}
  catch(e){cues=[];setStatus(e.message);$('cue').textContent='This video refuses to use its inside voice.'}
  await ytReady;
  if(player?.loadVideoById){player.loadVideoById(id);player.mute();return}
  player=new YT.Player('player',{videoId:id,playerVars:{playsinline:1,rel:0},events:{onReady:e=>e.target.mute()}});
};
function whisper(text){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.toLowerCase());u.rate=.86;u.pitch=.72;u.volume=.72;const voices=speechSynthesis.getVoices();const soft=voices.find(v=>/samantha|victoria|ava|zira|aria|serena|female/i.test(v.name));if(soft)u.voice=soft;speechSynthesis.speak(u);$('cue').textContent=text.toLowerCase()}
function tick(){if(!player?.getCurrentTime||!cues.length)return;const t=player.getCurrentTime();let i=-1;for(let n=0;n<cues.length;n++){if(cues[n].time<=t)i=n;else break}if(i>=0&&i!==lastCue){lastCue=i;whisper(cues[i].text)}}
$('inside').onclick=()=>{if(!cues.length){setStatus('No captions available');return}player?.mute();lastCue=-1;clearInterval(timer);timer=setInterval(tick,180);setStatus('Inside voice engaged',true);tick()};
$('stop').onclick=()=>{clearInterval(timer);speechSynthesis.cancel();setStatus('Whispering stopped');$('cue').textContent='Nothing yet. Blissful silence.'};
document.addEventListener('visibilitychange',()=>{if(document.hidden)speechSynthesis.cancel()});
