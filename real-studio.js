(() => {
 'use strict';
 const pieces=window.MANTRA_SOURCES;
 const el=id=>document.getElementById(id);
 const mantra=el('mantra'),version=el('version'),wrap=el('video-wrap'),status=el('player-status'),rate=el('rate'),loop=el('loop');
 let piece=pieces[0],recording=piece.versions[0],player=null,ready=false,generation=0,poll=null,seekGuard=0,readyTimer=null;
 let interval={a:0,b:null},preferences={piece:'gayatri',versions:{},intervals:{}};
 try{const saved=JSON.parse(localStorage.getItem('harmonium-real-v1')||'null');if(saved&&typeof saved==='object'){preferences={...preferences,...saved};if(!preferences.versions||typeof preferences.versions!=='object')preferences.versions={};if(!preferences.intervals||typeof preferences.intervals!=='object')preferences.intervals={};}}catch{}
 const fmt=t=>{t=Math.max(0,Number(t)||0);const m=Math.floor(t/60),s=Math.floor(t%60);return m+':'+String(s).padStart(2,'0');};
 const parse=s=>{s=String(s).trim().replace(',','.');if(/^\d+(\.\d+)?$/.test(s))return Number(s);if(/^\d+:\d{1,2}(\.\d+)?$/.test(s)){const [m,v]=s.split(':').map(Number);if(v<60)return m*60+v;}return NaN;};
 const persist=(saveInterval=true)=>{preferences.piece=piece.id;preferences.versions[piece.id]=recording.id;if(saveInterval)preferences.intervals[recording.id]={a:interval.a,b:interval.b};try{localStorage.setItem('harmonium-real-v1',JSON.stringify(preferences));}catch{}};
 const setMessage=(message,error=false)=>{status.textContent=message;status.classList.toggle('error',error);};
 const setReady=value=>{ready=value;el('play').disabled=!value;rate.disabled=!value;el('loop-controls').disabled=!value;};
 let apiPromise;
 function api(){
  if(window.YT?.Player)return Promise.resolve(window.YT);
  if(apiPromise)return apiPromise;
  apiPromise=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error('Ovládanie videa sa nenačítalo. Video môžeš prehrať cez jeho vlastné tlačidlo alebo otvoriť na YouTube.')),20000);
   window.onYouTubeIframeAPIReady=()=>{clearTimeout(timer);resolve(window.YT);};
   const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timer);reject(new Error('Prehliadač nenačítal YouTube. Použi odkaz Otvoriť na YouTube.'));};document.head.appendChild(script);
  });return apiPromise;
 }
 function stopPoll(){if(poll)clearInterval(poll);poll=null;}
 function duration(){return ready?Number(player.getDuration())||recording.duration||0:recording.duration||0;}
 function refreshMetadata(){
  if(!ready)return;
  const d=duration();
  if(d>0&&(!interval.b||interval.b>d||interval.a>=interval.b)){interval={a:0,b:d};el('start').value=fmt(0);el('end').value=fmt(d);}
  const speeds=player.getAvailablePlaybackRates()||[];
  if(speeds.length&&[...rate.options].map(o=>o.value).join(',')!==speeds.map(String).join(','))rate.replaceChildren(...speeds.map(s=>new Option(s+'×',String(s))));
  rate.value=String(player.getPlaybackRate()||1);
 }
 function validate(show=true){
  const a=parse(el('start').value),b=parse(el('end').value),d=duration();
  const okay=Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a&&(!d||b<=d+.1);
  el('loop-error').hidden=okay||!show;el('loop-error').textContent=okay?'':'Začiatok A musí byť nezáporný a koniec B musí byť neskôr než A, najviac po koniec videa.';
  if(okay){const changed=interval.a!==a||interval.b!==b;interval={a,b};if(changed)persist();}return okay;
 }
 function updateTime(){if(!ready)return;refreshMetadata();const t=player.getCurrentTime()||0,d=duration();el('time').textContent=fmt(t)+' / '+fmt(d);if(player.getPlayerState()===1&&loop.checked&&validate(false)&&t>=interval.b&&Date.now()>seekGuard){seekGuard=Date.now()+700;player.seekTo(interval.a,true);}}
 function stateChanged(event){
  stopPoll();
  refreshMetadata();
  if(event.data===1){setMessage('Prehráva sa '+recording.performer);poll=setInterval(updateTime,200);}
  else if(event.data===2){setMessage('Pozastavené');updateTime();}
  else if(event.data===3)setMessage('Načítavam video…');
  else if(event.data===0){if(loop.checked&&validate(false)){player.seekTo(interval.a,true);player.playVideo();}else setMessage('Prednes dokončený');}
 }
 function showPiece(){
  version.replaceChildren(...piece.versions.map(v=>{const o=document.createElement('option');o.value=v.id;o.textContent=v.label;return o;}));version.value=recording.id;
  el('version-label').hidden=piece.versions.length===1;
  el('piece-title').textContent=piece.title;el('credit').textContent=recording.performer+' · '+recording.language;
  el('lyrics').replaceChildren(...piece.text.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));
  el('text-source').href=piece.textSource;el('notes-info').textContent=recording.notesInfo;el('notes-source').href=recording.notesUrl;el('notes-source').textContent=recording.notesLabel;el('version-info').textContent=recording.info;el('author-source').href=recording.source;
  el('watch').href='https://www.youtube.com/watch?v='+recording.id;
 }
 async function load(){
  const current=++generation;stopPoll();seekGuard=0;clearTimeout(readyTimer);setReady(false);
  if(player){try{player.destroy();}catch{}}player=null;wrap.replaceChildren();showPiece();
  loop.checked=false;el('loop-error').hidden=true;
  const saved=preferences.intervals[recording.id];interval={a:Number(saved?.a)||0,b:Number(saved?.b)||recording.duration||null};
  el('start').value=fmt(interval.a);el('end').value=fmt(interval.b);el('time').textContent='0:00 / '+fmt(recording.duration);
  rate.replaceChildren(new Option('1×','1'));
  const frame=document.createElement('iframe');frame.id='real-video-player';frame.title=piece.title+' — '+recording.performer;frame.allow='autoplay; encrypted-media; picture-in-picture; fullscreen';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  const params=new URLSearchParams({enablejsapi:'1',playsinline:'1',rel:'0'});if(/^https?:$/.test(location.protocol))params.set('origin',location.origin);
  frame.src='https://www.youtube-nocookie.com/embed/'+recording.id+'?'+params;wrap.appendChild(frame);setMessage('Načítavam prednes…');
  readyTimer=setTimeout(()=>{if(current===generation&&!ready)setMessage('Video alebo jeho ovládanie sa nenačítalo. Skús vlastné tlačidlo videa alebo Otvoriť na YouTube.',true);},25000);
  try{const YT=await api();if(current!==generation)return;
   player=new YT.Player(frame,{events:{onReady:()=>{if(current!==generation)return;clearTimeout(readyTimer);setReady(true);refreshMetadata();el('time').textContent='0:00 / '+fmt(duration());
    setMessage('Pripravené — spusti prednes tlačidlom videa alebo Prehrať.');
   },onStateChange:e=>{if(current===generation)stateChanged(e);},onPlaybackRateChange:e=>{if(current===generation){rate.value=String(e.data);}},onError:e=>{if(current!==generation)return;setReady(false);stopPoll();clearTimeout(readyTimer);const reason=({100:'Video nie je dostupné.',101:'Autor nepovoľuje vložené prehrávanie.',150:'Autor nepovoľuje vložené prehrávanie.',153:'Webové zobrazenie neposlalo identifikáciu stránky.'})[e.data]||'Video sa nepodarilo prehrať.';setMessage(reason+' Otvor ho cez odkaz na YouTube.',true);},onAutoplayBlocked:()=>{if(current===generation)setMessage('Spusti prednes kliknutím priamo na tlačidlo v YouTube videu.');}}});
  }catch(error){if(current===generation)setMessage(error.message,true);}
 }
 mantra.replaceChildren(...pieces.map(p=>new Option(p.title,p.id)));piece=pieces.find(p=>p.id===preferences.piece)||pieces[0];recording=piece.versions.find(v=>v.id===preferences.versions[piece.id])||piece.versions[0];mantra.value=piece.id;
 mantra.addEventListener('change',()=>{piece=pieces.find(p=>p.id===mantra.value);recording=piece.versions.find(v=>v.id===preferences.versions[piece.id])||piece.versions[0];persist(false);load();});
 version.addEventListener('change',()=>{recording=piece.versions.find(v=>v.id===version.value);persist(false);load();});
 el('play').addEventListener('click',()=>{if(!ready)return;if(player.getPlayerState()===1)player.pauseVideo();else{if(loop.checked&&validate(false)&&(player.getCurrentTime()<interval.a||player.getCurrentTime()>=interval.b))player.seekTo(interval.a,true);player.playVideo();}});
 rate.addEventListener('change',()=>{if(ready)player.setPlaybackRate(Number(rate.value));});
 el('mark-start').addEventListener('click',()=>{if(ready){el('start').value=fmt(player.getCurrentTime());validate();}});
 el('mark-end').addEventListener('click',()=>{if(ready){el('end').value=fmt(player.getCurrentTime());validate();}});
 for(const id of ['start','end'])el(id).addEventListener('change',()=>{if(!validate())loop.checked=false;});
 loop.addEventListener('change',()=>{if(loop.checked&&!validate())loop.checked=false;});
 el('go-start').addEventListener('click',()=>{if(ready&&validate()){seekGuard=Date.now()+700;player.seekTo(interval.a,true);}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&ready&&loop.checked&&player.getPlayerState()===1)player.pauseVideo();});
 window.addEventListener('pagehide',()=>{stopPoll();if(player&&ready)try{player.pauseVideo();}catch{}});
 window.realStudioQA={getSelection:()=>({piece:piece.id,video:recording.id}),getInterval:()=>({...interval}),isReady:()=>ready};
 load();
})();
