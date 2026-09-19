let player,timer,cues=[],lastCue=-1,pendingVideoId=null;
const $=id=>document.getElementById(id);
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
  const frame=$('player');
  frame.src='https://www.youtube-nocookie.com/embed/'+encodeURIComponent(id)+'?playsinline=1&rel=0&enablejsapi=1&origin='+encodeURIComponent(location.origin);
};
function whisper(text){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text.toLowerCase());u.rate=.86;u.pitch=.72;u.volume=.72;const voices=speechSynthesis.getVoices();const soft=voices.find(v=>/samantha|victoria|ava|zira|aria|serena|female/i.test(v.name));if(soft)u.voice=soft;speechSynthesis.speak(u);$('cue').textContent=text.toLowerCase()}
function tick(){/* Direct embed diagnostic: timeline sync will be reattached after player rendering is confirmed. */}
$('inside').onclick=()=>{if(!cues.length){setStatus('No captions available');return}setStatus('Transcript ready — player sync comes next.',true)};
$('stop').onclick=()=>{clearInterval(timer);speechSynthesis.cancel();setStatus('Whispering stopped');$('cue').textContent='Nothing yet. Blissful silence.'};
document.addEventListener('visibilitychange',()=>{if(document.hidden)speechSynthesis.cancel()});
