let player,timer,cues=[],lastCue=-1,pendingVideoId=null,insideVoiceOn=false;
const $=id=>document.getElementById(id);
let ytReadyResolve;
const ytReady=new Promise(resolve=>ytReadyResolve=resolve);
window.onYouTubeIframeAPIReady=()=>ytReadyResolve?.();
if(window.YT?.Player) ytReadyResolve?.();
function videoId(value){try{const u=new URL(value.trim());if(u.hostname.includes('youtu.be'))return u.pathname.slice(1).split('/')[0];if(u.pathname.includes('/shorts/'))return u.pathname.split('/shorts/')[1].split('/')[0];return u.searchParams.get('v')}catch{return /^[\w-]{11}$/.test(value.trim())?value.trim():null}}
function setStatus(text,on=false){$('status').textContent=text;document.querySelector('.status')?.classList.toggle('active',on)}
async function serverCaptions(id){const r=await fetch('/api/captions?videoId='+encodeURIComponent(id));const data=await r.json();if(!r.ok){const e=new Error(data.error||'Could not get captions');e.code=data.code;throw e}return data.cues}
async function getCaptions(id){return {cues:await serverCaptions(id),source:'supadata'}}
$('load').onclick=async()=>{
  const id=videoId($('url').value);if(!id){$('url').focus();return}
  $('stage').classList.remove('hidden');setStatus('Getting captions…');$('cue').textContent='Getting the transcript…';
  try{const result=await getCaptions(id);cues=result.cues;setStatus(cues.length+' caption cues ready · '+result.source);$('cue').textContent='Ready. Press play, then use your inside voice.'}
  catch(e){cues=[];setStatus(e.message);$('cue').textContent='This video refuses to use its inside voice.'}
  pendingVideoId=id;
  insideVoiceOn=false;clearInterval(timer);speechSynthesis.cancel();lastCue=-1;
  const frame=$('player');
  frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
  try{
    await Promise.race([ytReady,new Promise((_,reject)=>setTimeout(()=>reject(new Error('YouTube controls did not become ready.')),10000))]);
    // Important: attach the API to the iframe that already works. Do not ask
    // YouTube to replace/create our player element again.
    player=new YT.Player(frame,{
      events:{
        onReady:e=>{e.target.mute();setStatus(cues.length+' caption cues ready · supadata')},
        onError:e=>{
          const messages={2:'YouTube rejected this video ID.',5:'YouTube could not play this video.',100:'This YouTube video is unavailable.',101:'The creator has disabled embedded playback.',150:'The creator has disabled embedded playback.'};
          setStatus(messages[e.data]||('YouTube player error '+e.data+'.'));
        },
        onStateChange:e=>{
          if(e.data===YT.PlayerState.PLAYING&&insideVoiceOn) tick();
          if(e.data===YT.PlayerState.PAUSED||e.data===YT.PlayerState.ENDED) speechSynthesis.cancel();
        }
      }
    });
  }catch(e){setStatus(e.message)}
};
function whisper(text){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.toLowerCase());u.rate=.86;u.pitch=.72;u.volume=.72;const voices=speechSynthesis.getVoices();const soft=voices.find(v=>/samantha|victoria|ava|zira|aria|serena|female/i.test(v.name));if(soft)u.voice=soft;speechSynthesis.speak(u);$('cue').textContent=text.toLowerCase()}
function tick(){
  if(!insideVoiceOn||!player?.getCurrentTime||!cues.length)return;
  const t=player.getCurrentTime();
  let i=-1;
  for(let n=0;n<cues.length;n++){if(cues[n].time<=t)i=n;else break}
  if(i>=0&&i!==lastCue){
    // Don't speak a stale cue after a large seek or during a transcript gap.
    const cue=cues[i],end=cue.time+Math.max(cue.duration||0,2.5);
    lastCue=i;
    if(t<=end)whisper(cue.text);
  }
}
$('inside').onclick=()=>{
  if(!cues.length){setStatus('No captions available');return}
  if(!player?.getCurrentTime){setStatus('YouTube controls are still loading…');return}
  insideVoiceOn=true;player.mute();lastCue=-1;clearInterval(timer);timer=setInterval(tick,150);
  setStatus('Inside voice engaged',true);tick();
};
$('stop').onclick=()=>{insideVoiceOn=false;clearInterval(timer);speechSynthesis.cancel();setStatus('Whispering stopped');$('cue').textContent='Nothing yet. Blissful silence.'};
document.addEventListener('visibilitychange',()=>{if(document.hidden)speechSynthesis.cancel()});
