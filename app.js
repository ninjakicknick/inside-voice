let player,timer,cues=[],lastCue=-1,pendingVideoId=null,insideVoiceOn=false,currentWhisper=new Audio();
const whisperCache=new Map();
const whisperRequests=new Map();
const $=id=>document.getElementById(id);
let ytReadyResolve;
const ytReady=new Promise(resolve=>ytReadyResolve=resolve);
window.onYouTubeIframeAPIReady=()=>ytReadyResolve?.();
if(window.YT?.Player) ytReadyResolve?.();
function videoId(value){try{const u=new URL(value.trim());if(u.hostname.includes('youtu.be'))return u.pathname.slice(1).split('/')[0];if(u.pathname.includes('/shorts/'))return u.pathname.split('/shorts/')[1].split('/')[0];return u.searchParams.get('v')}catch{return /^[\w-]{11}$/.test(value.trim())?value.trim():null}}
function setStatus(text,on=false){$('status').textContent=text;document.querySelector('.status')?.classList.toggle('active',on)}
const INSIDE_VOICE_RATE=0.5;
let rateRetryTimer=null;
function enforcePlaybackRate(attempt=0){
  if(!insideVoiceOn||!player?.setPlaybackRate)return;
  try{
    const rates=player.getAvailablePlaybackRates?.()||[];
    const target=rates.length&& !rates.includes(INSIDE_VOICE_RATE)?rates.filter(r=>r<1).sort((a,b)=>Math.abs(a-INSIDE_VOICE_RATE)-Math.abs(b-INSIDE_VOICE_RATE))[0]||1:INSIDE_VOICE_RATE;
    player.setPlaybackRate(target);
    clearTimeout(rateRetryTimer);
    if(attempt<5){
      rateRetryTimer=setTimeout(()=>{
        if(!insideVoiceOn)return;
        const actual=player.getPlaybackRate?.();
        if(actual!==target)enforcePlaybackRate(attempt+1);
      },200);
    }
  }catch{}
}
async function serverCaptions(id){const r=await fetch('/api/captions?videoId='+encodeURIComponent(id));const data=await r.json();if(!r.ok){const e=new Error(data.error||'Could not get captions');e.code=data.code;throw e}return data.cues}
async function getCaptions(id){return {cues:await serverCaptions(id),source:'supadata'}}
async function loadVideo(){
  const id=videoId($('url').value);if(!id){$('url').focus();return}
  $('stage').classList.remove('hidden');setStatus('Getting captions…');$('cue').textContent='Getting the transcript…';
  try{const result=await getCaptions(id);cues=result.cues;setStatus(cues.length+' caption cues ready · '+result.source);$('cue').textContent='Ready. Press play, then use your inside voice.'}
  catch(e){cues=[];setStatus(e.message);$('cue').textContent='This video refuses to use its inside voice.'}
  pendingVideoId=id;
  insideVoiceOn=false;clearInterval(timer);currentWhisper.pause();currentWhisper.removeAttribute('src');currentWhisper.load();lastCue=-1;for(const url of whisperCache.values())URL.revokeObjectURL(url);whisperCache.clear();whisperRequests.clear();
  const frame=$('player');
  frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  try{
    await Promise.race([ytReady,new Promise((_,reject)=>setTimeout(()=>reject(new Error('YouTube controls did not become ready.')),10000))]);
    // Important: attach the API to the iframe that already works. Do not ask
    // YouTube to replace/create our player element again.
    player=new YT.Player(frame,{
      events:{
        onReady:e=>{e.target.mute();if(insideVoiceOn)enforcePlaybackRate();setStatus(cues.length+' caption cues ready · supadata')},
        onError:e=>{
          const messages={2:'YouTube rejected this video ID.',5:'YouTube could not play this video.',100:'This YouTube video is unavailable.',101:'The creator has disabled embedded playback.',150:'The creator has disabled embedded playback.'};
          setStatus(messages[e.data]||('YouTube player error '+e.data+'.'));
        },
        onStateChange:e=>{
          if(e.data===YT.PlayerState.PLAYING&&insideVoiceOn){enforcePlaybackRate();tick();}
          if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED) currentWhisper.pause();
        }
      }
    });
  }catch(e){setStatus(e.message)}
}
$('load').onclick=loadVideo;
async function getWhisperUrl(index){
  if(whisperCache.has(index))return whisperCache.get(index);
  if(whisperRequests.has(index))return whisperRequests.get(index);
  const request=(async()=>{
    const cue=cues[index];if(!cue)throw new Error('Missing transcript cue.');
    const r=await fetch('/api/whisper',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:cue.text})});
    if(!r.ok){const data=await r.json().catch(()=>({}));throw new Error(data.error||'Whisper generation failed.')}
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    whisperCache.set(index,url);
    return url;
  })().finally(()=>whisperRequests.delete(index));
  whisperRequests.set(index,request);
  return request;
}
async function whisper(index){
  const cue=cues[index];if(!cue)return;
  $('cue').textContent=cue.text.toLowerCase();
  try{
    const url=await getWhisperUrl(index);
    if(!insideVoiceOn||lastCue!==index)return;
    currentWhisper.pause();
    currentWhisper.src=url;
    currentWhisper.volume=.9;
    currentWhisper.currentTime=0;
    await currentWhisper.play();
    // Prefetch only one line ahead, after the current line has succeeded.
    getWhisperUrl(index+1).catch(()=>{});
  }catch(e){setStatus(e.message||'The whisper voice failed.')}
}
function tick(){
  if(!insideVoiceOn||!player?.getCurrentTime||!cues.length)return;
  const t=player.getCurrentTime();
  let i=-1;
  for(let n=0;n<cues.length;n++){if(cues[n].time<=t)i=n;else break}
  if(i>=0&&i!==lastCue){
    // Don't speak a stale cue after a large seek or during a transcript gap.
    const cue=cues[i],end=cue.time+Math.max(cue.duration||0,2.5);
    lastCue=i;
    if(t<=end)whisper(i);
  }
}
$('inside').onclick=()=>{
  if(!cues.length){setStatus('No captions available');return}
  if(!player?.getCurrentTime){setStatus('YouTube controls are still loading…');return}
  // Unlock this persistent audio element inside the user's tap. Mobile browsers
  // may reject play() on Audio objects created later by an async TTS request.
  currentWhisper.muted=true;currentWhisper.play().catch(()=>{});currentWhisper.pause();currentWhisper.muted=false;
  insideVoiceOn=true;player.mute();enforcePlaybackRate();lastCue=-1;clearInterval(timer);timer=setInterval(tick,150);
  setStatus('Inside voice engaged',true);tick();
};
$('share').onclick=async()=>{
  const id=pendingVideoId||videoId($('url').value);if(!id){setStatus('Load a video before sharing');return}
  const shareUrl=new URL(location.origin);shareUrl.searchParams.set('v',id);
  const data={title:'Inside Voice',text:'Watch this with Inside Voice 🤫',url:shareUrl.toString()};
  try{
    if(navigator.share){await navigator.share(data);return}
    await navigator.clipboard.writeText(shareUrl.toString());setStatus('Inside Voice link copied');
  }catch(e){if(e?.name!=='AbortError')setStatus('Could not share this link')}
};
$('stop').onclick=()=>{insideVoiceOn=false;clearInterval(timer);clearTimeout(rateRetryTimer);currentWhisper.pause();try{player?.setPlaybackRate?.(1)}catch{}setStatus('Whispering stopped');$('cue').textContent='Nothing yet. Blissful silence.'};
document.addEventListener('visibilitychange',()=>{if(document.hidden)currentWhisper.pause()});

const deepLinkedVideo=new URLSearchParams(location.search).get('v');
if(deepLinkedVideo&&/^[\w-]{11}$/.test(deepLinkedVideo)){
  $('url').value='https://www.youtube.com/watch?v='+deepLinkedVideo;
  window.addEventListener('load',()=>loadVideo());
}
if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));}
