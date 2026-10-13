/* Reusable staff notation and a monophonic practice player. No repertoire is embedded here. */
(() => {
 'use strict';
 const instances=new Set(),NS='http://www.w3.org/2000/svg';
 const mod=n=>((n%12)+12)%12;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const values=[4,3,2,1.5,1,.75,.5,.375,.25,.1875,.125,.09375,.0625];
 const spellSharp=[['C',0],['C',1],['D',0],['D',1],['E',0],['F',0],['F',1],['G',0],['G',1],['A',0],['A',1],['B',0]];
 const spellFlat=[['C',0],['D',-1],['D',0],['E',-1],['E',0],['F',0],['G',-1],['G',0],['A',-1],['A',0],['B',-1],['B',0]];
 let audioContext,wave;

 function normalize(input){
  if(!input||!Array.isArray(input.notes)||!input.notes.length)throw new Error('Notový zápis nemá žiadne tóny.');
  const signature=input.timeSignature||[4,4];
  if(!Array.isArray(signature)||signature.length!==2||!Number.isInteger(signature[0])||signature[0]<1||signature[0]>16||![2,4,8,16].includes(signature[1]))throw new Error('Nepodporované metrum notového zápisu.');
  let start=0;
  const notes=input.notes.map((n,index)=>{
   const midi=n.midi===null?null:Number(n.midi),beats=Number(n.beats);
   if((midi!==null&&(!Number.isInteger(midi)||midi<0||midi>127))||!Number.isFinite(beats)||beats<=0||Math.abs(beats*16-Math.round(beats*16))>1e-7)throw new Error('Neplatná výška alebo rytmická hodnota tónu '+(index+1)+'.');
   const note={...n,midi,beats,lyric:String(n.lyric??''),start,index};start+=beats;return note;
  });
  const pickupBeats=Number(input.pickupBeats)||0,barBeats=signature[0]*4/signature[1];
  if(pickupBeats<0||pickupBeats>=barBeats||Math.abs(pickupBeats*16-Math.round(pickupBeats*16))>1e-7)throw new Error('Neplatná dĺžka predtaktia.');
  return {...input,notes,timeSignature:[...signature],meterVisible:input.meterVisible!==false&&input.timeSignature!==false&&input.showTimeSignature!==false&&!input.unmetered,pickupBeats,totalBeats:start,bpm:clamp(Number(input.bpm)||64,20,240),fifths:clamp(Math.round(Number(input.fifths??input.key?.fifths)||0),-7,7)};
 }

 function pitch(midi,fifths,spelling){
  let octave=Math.floor(midi/12)-1,[letter,alter]=(fifths<0?spellFlat:spellSharp)[mod(midi)];
  if(fifths>=6&&mod(midi)===5)[letter,alter]=['E',1];
  if(fifths>=7&&mod(midi)===0){[letter,alter]=['B',1];octave--;}
  if(fifths<=-6&&mod(midi)===4)[letter,alter]=['F',-1];
  if(fifths<=-7&&mod(midi)===11){[letter,alter]=['C',-1];octave++;}
  const named=typeof spelling==='string'&&spelling.match(/^([A-G])([#b]?)(-?\d+)$/);
  if(named){
   const wantedAlter=named[2]==='#'?1:named[2]==='b'?-1:0,oct=Number(named[3]);
   const pc={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[named[1]];
   if((oct+1)*12+pc+wantedAlter===midi){letter=named[1];alter=wantedAlter;octave=oct;}
  }
  return {letter,alter,octave,step:octave*7+'CDEFGAB'.indexOf(letter),name:(letter==='B'&&alter===0?'H':letter)+(alter===1?'♯':alter===-1?'♭':'')+octave};
 }
 function expectedAlter(letter,fifths){return (fifths>0?'FCGDAEB':'BEADGCF').slice(0,Math.abs(fifths)).includes(letter)?Math.sign(fifths):0;}
 function rhythm(beats){
  const dotted=[3,1.5,.75,.375,.1875,.09375].some(v=>Math.abs(v-beats)<1e-8);
  return {base:dotted?beats/1.5:beats,dotted};
 }
 function layout(score){
  const barBeats=score.timeSignature[0]*4/score.timeSignature[1],bars=[];
  if(score.unmetered)return score.notes.map(note=>{
   const width=Math.max(38,note.lyric.length*7+16);
   return {index:note.index,segments:[{...note,part:0,tieIn:false,tieOut:false,width}],minWidth:width+12};
  });
  for(const note of score.notes){
   let cursor=note.start,remaining=note.beats,part=0;
   while(remaining>1e-8){
    const pickup=score.pickupBeats,barIndex=pickup?(cursor<pickup-1e-8?0:1+Math.floor((cursor-pickup+1e-8)/barBeats)):Math.floor((cursor+1e-8)/barBeats);
    const boundary=pickup?(barIndex===0?pickup:pickup+barIndex*barBeats):(barIndex+1)*barBeats;
    const available=Math.min(remaining,boundary-cursor);
    const length=values.find(v=>v<=available+1e-8);
    if(!length)throw new Error('Rytmickú hodnotu sa nepodarilo zapísať.');
    if(!bars[barIndex])bars[barIndex]={index:barIndex,segments:[]};
    const lyric=part===0?note.lyric:'';
    const segment={...note,beats:length,start:cursor,lyric,part,tieIn:part>0&&note.midi!==null,tieOut:remaining>length+1e-8&&note.midi!==null,width:Math.max(38,lyric.length*7+16)};
    bars[barIndex].segments.push(segment);
    remaining-=length;cursor+=length;part++;
   }
  }
  for(const bar of bars)bar.minWidth=bar.segments.reduce((sum,n)=>sum+n.width,0)+20;
  return bars;
 }

 function variableLength(value){
  let n=Math.max(0,Math.round(value)),buffer=n&127;
  const bytes=[];while((n>>=7))buffer=(buffer<<8)|((n&127)|128);
  while(true){bytes.push(buffer&255);if(buffer&128)buffer>>=8;else break;}return bytes;
 }
 function makeMidi(score,settings={}){
  score=normalize(score);
  const bpm=clamp(Number(settings.tempo??score.bpm)||score.bpm,20,240),transpose=Math.round(Number(settings.transpose)||0),ticks=480;
  if(score.notes.some(n=>n.midi!==null&&(n.midi+transpose<0||n.midi+transpose>127)))throw new Error('Transpozícia je mimo rozsahu MIDI.');
  const utf8=new TextEncoder(),title=[...utf8.encode(String(score.title||score.id||'Mantra'))];
  const tempo=Math.round(60000000/bpm),time=score.timeSignature;
  const events=[{time:0,order:-4,data:[255,3,...variableLength(title.length),...title]},
   {time:0,order:-3,data:[255,81,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255]},
   {time:0,order:-1,data:[192,20]}]; // General MIDI Reed Organ, program 21 (zero-based 20).
  if(score.meterVisible&&settings.meterVisible!==false)events.push({time:0,order:-2,data:[255,88,4,time[0],Math.log2(time[1]),24,8]});
  for(const note of score.notes){if(note.midi===null)continue;const midi=note.midi+transpose;
   events.push({time:Math.round(note.start*ticks),order:1,data:[144,midi,80]},
    {time:Math.round((note.start+note.beats)*ticks),order:0,data:[128,midi,0]});
  }
  events.push({time:Math.round(score.totalBeats*ticks),order:2,data:[255,47,0]});
  events.sort((a,b)=>a.time-b.time||a.order-b.order);let prior=0;const track=[];
  for(const e of events){track.push(...variableLength(e.time-prior),...e.data);prior=e.time;}
  const length=track.length;
  return new Uint8Array([77,84,104,100,0,0,0,6,0,0,0,1,(ticks>>8)&255,ticks&255,77,84,114,107,(length>>>24)&255,(length>>>16)&255,(length>>>8)&255,length&255,...track]);
 }

 function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
 function button(text,className){const el=element('button',className,text);el.type='button';return el;}
 function labelled(text,control){const label=element('label');label.append(element('span','',text),control);return label;}
 function number(min,max,value){const el=element('input');el.type='number';el.min=String(min);el.max=String(max);el.step='1';el.value=String(value);return el;}
 function rest(segment,x,y){
  const {base,dotted}=rhythm(segment.beats);let html='';
  if(base>=2)html=`<rect class="score-rest" x="${x-5}" y="${base===4?y-4:y}" width="10" height="4"/>`;
  else if(base===1)html=`<path class="score-rest" d="M ${x-3} ${y-4} l 8 9 -7 7 6 8 c -13 -3 -11 5 -5 9 c -11 -6 -6 -14 1 -15 l -7 -9 7 -7 Z"/>`;
  else{const flags=Math.round(Math.log2(1/base)),top=y-2-(flags-1)*6;
   html=`<path class="score-stem" d="M ${x+5} ${top} l -7 ${19+(flags-1)*6}"/>`;
   for(let f=0;f<flags;f++)html+=`<circle class="score-rest" cx="${x-3}" cy="${top+f*6+3}" r="3"/><path class="score-stem" d="M ${x-3} ${top+f*6+3} Q ${x+2} ${top+f*6+11} ${x+5} ${top+f*6}"/>`;
  }
  if(dotted)html+=`<circle class="score-dot" cx="${x+13}" cy="${y+10}" r="1.8"/>`;
  return html;
 }

 function mount(container,input){
  if(!(container instanceof Element))throw new TypeError('Notový prehrávač potrebuje kontajner na stránke.');
  const score=normalize(input),bars=layout(score),root=element('section','mantra-score-player');
  root.setAttribute('aria-label','Noty a syntetická melódia: '+(score.title||'mantra'));
  const heading=element('h2','',score.title||'Noty a melódia');root.append(heading);
  if(score.description)root.append(element('p','score-description',score.description));
  const sources=element('p','score-source-links');
  for(const [value,label] of [[score.sourceUrl,score.sourceLabel||'Zdroj notového zápisu'],[score.sourceImage,'Pôvodný notový obrázok'],[score.secondSourceImage,score.secondSourceLabel||'Záver śāntiḥ']]){
   if(!value)continue;try{const url=new URL(value,location.href);if(/^https?:$/.test(url.protocol)){if(sources.childNodes.length)sources.append(document.createTextNode(' · '));const a=element('a','score-source',label);a.href=url.href;a.target='_blank';a.rel='noopener';sources.append(a);}}catch{}
  }
  if(sources.childNodes.length)root.append(sources);
  if(typeof score.accompaniment==='string'&&score.accompaniment)root.append(element('p','score-description',score.accompaniment));
  const controls=element('div','score-controls'),tempo=number(20,240,score.bpm),transpose=number(-12,12,0);
  controls.append(labelled('Tempo (BPM)',tempo),labelled('Transpozícia (poltóny)',transpose));root.append(controls);
  const actions=element('div','score-actions'),start=button('Prehrať melódiu','score-start'),pauseButton=button('Pozastaviť'),stopButton=button('Zastaviť'),midiButton=button('Stiahnuť MIDI');
  pauseButton.disabled=true;stopButton.disabled=true;
  const repeat=document.createElement('input');repeat.type='checkbox';const repeatLabel=labelled('Opakovať',repeat);repeatLabel.replaceChildren(repeat,document.createTextNode('Opakovať'));
  actions.append(start,pauseButton,stopButton,repeatLabel,midiButton);root.append(actions);
  const caption=element('p','score-caption'),scoreArea=element('div','score-area'),status=element('p','score-status','Pripravené'),current=element('p','score-current',''),progress=document.createElement('progress');
  status.setAttribute('role','status');status.setAttribute('aria-live','polite');current.setAttribute('aria-live','off');progress.className='score-progress';progress.max=100;progress.value=0;progress.setAttribute('aria-label','Priebeh syntetickej melódie');
  root.append(caption,scoreArea,status,current,progress,element('p','score-note',(score.unmetered?'Voľná recitácia: zdroj uvádza výšky, trvanie pri prehrávaní je rovnomerná pomôcka. ':'')+'Syntetický tón bez spevu. MIDI použije zvolené tempo a transpozíciu. H označuje prirodzený tón B.'));
  container.replaceChildren(root);
  let settings={tempo:score.bpm,transpose:0,repeat:false},playing=false,paused=false,offset=0,anchorTime=0,anchorBeat=0,frame=0,scheduledCycle=-1,generation=0,currentIndex=-1,destroyed=false,nodes=new Set(),analyser,master;

  function transformedPitch(note){return pitch(note.midi+settings.transpose,settings.transpose===0?score.fifths:0,settings.transpose===0?note.spelling:undefined);}
  function draw(){
   if(destroyed)return;
   const available=Math.max(260,Math.floor(scoreArea.getBoundingClientRect().width||760)),fifths=settings.transpose===0?score.fifths:0;
   const left=(score.meterVisible?67:48)+Math.abs(fifths)*9,systems=[];let line=[],minimum=left+12;
   for(const bar of bars){if(line.length&&minimum+bar.minWidth>available){systems.push(line);line=[];minimum=left+12;}line.push(bar);minimum+=bar.minWidth;}
   if(line.length)systems.push(line);
   const sounding=score.notes.filter(n=>n.midi!==null).map(transformedPitch),min=sounding.length?Math.min(...sounding.map(p=>p.step)):30,max=sounding.length?Math.max(...sounding.map(p=>p.step)):38;
   caption.textContent=(score.unmetered?'Voľná recitácia':score.meterVisible?score.timeSignature.join('/'):'Melódia')+' · rozsah '+(sounding.length?pitch(Math.min(...score.notes.filter(n=>n.midi!==null).map(n=>n.midi+settings.transpose)),fifths).name+'–'+pitch(Math.max(...score.notes.filter(n=>n.midi!==null).map(n=>n.midi+settings.transpose)),fifths).name:'pauzy')+' · '+(settings.transpose>0?'+':'')+settings.transpose+' poltónov';
   let html='';
   for(const system of systems){
    const minimumWidth=left+12+system.reduce((sum,b)=>sum+b.minWidth,0),width=Math.max(available,minimumWidth),extra=(width-minimumWidth)/system.length;
    const top=38+Math.max(0,max-38)*4,bottom=top+32,noteBottom=bottom+Math.max(0,30-min)*4,lyricY=noteBottom+54,height=lyricY+20;
    html+=`<div class="score-system-wrap"><svg class="score-system" xmlns="${NS}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(score.title||'Mantra')}, ${score.unmetered?'tóny':'takty'} ${system[0].index+1} až ${system.at(-1).index+1}"><title>${escape(score.title||'Mantra')}: noty a slabiky</title>`;
    for(let y=top;y<=bottom;y+=8)html+=`<path class="score-struct" d="M 8 ${y} H ${width-12}"/>`;
    html+=`<text class="score-clef" x="9" y="${bottom+8}">𝄞</text>`;
    const sigYs=fifths>0?[0,12,-4,8,20,4,16]:[16,4,20,8,24,12,28];
    for(let i=0;i<Math.abs(fifths);i++)html+=`<text class="score-accidental" x="${38+i*9}" y="${top+sigYs[i]+7}">${fifths>0?'♯':'♭'}</text>`;
    if(score.meterVisible)html+=`<text class="score-label" x="${left-19}" y="${top+14}">${score.timeSignature[0]}</text><text class="score-label" x="${left-19}" y="${top+28}">${score.timeSignature[1]}</text>`;
    let bx=left;const tiePoints=[];
    for(const bar of system){
     const padding=score.unmetered?12:20,barWidth=bar.minWidth+extra,slotScale=(barWidth-padding)/(bar.minWidth-padding),memory={};let cursor=bx+padding/2;
     if(!score.unmetered)html+=`<text class="score-label" x="${bx+10}" y="${top-18}">${bar.index+1}</text>`;
     for(const n of bar.segments){
      const slot=n.width*slotScale,x=cursor+slot/2;cursor+=slot;
      const {base,dotted}=rhythm(n.beats);html+=`<g data-score-note="${n.index}"${n.index===currentIndex?' class="score-active"':''}>`;
      if(n.midi===null)html+=rest(n,x,top+12);
      else{
       const p=transformedPitch(n),y=bottom-(p.step-30)*4,previous=memory[p.step]??expectedAlter(p.letter,fifths);
       if(previous!==p.alter)html+=`<text class="score-accidental" x="${x-20}" y="${y+7}">${p.alter===1?'♯':p.alter===-1?'♭':'♮'}</text>`;memory[p.step]=p.alter;
       if(y>=bottom+8)for(let ledger=bottom+8;ledger<=y;ledger+=8)html+=`<path class="score-struct" d="M ${x-10} ${ledger} h 20"/>`;
       if(y<=top-8)for(let ledger=top-8;ledger>=y;ledger-=8)html+=`<path class="score-struct" d="M ${x-10} ${ledger} h 20"/>`;
       html+=`<ellipse class="score-head${!score.unmetered&&base>=2?' score-hollow':''}" cx="${x}" cy="${y}" rx="${!score.unmetered&&base===4?6.5:5.7}" ry="3.8" transform="rotate(-18 ${x} ${y})"/>`;
       if(!score.unmetered&&base<4){const down=y<=top+16,sx=x+(down?-5.2:5.2),sy=y+(down?30:-30);
        html+=`<path class="score-stem" d="M ${sx} ${y} V ${sy}"/>`;
        if(base<1)for(let f=0;f<Math.round(Math.log2(1/base));f++){const fy=sy+(down?-1:1)*f*5;html+=`<path class="score-stem" d="M ${sx} ${fy} q ${down?-12:12} ${down?-5:5} ${down?-7:7} ${down?-16:16}"/>`;}
       }
       if(dotted&&!score.unmetered)html+=`<circle class="score-dot" cx="${x+11}" cy="${Math.abs((y-top)%8)<1e-7?y-3:y}" r="1.7"/>`;
       tiePoints.push({index:n.index,tieIn:n.tieIn,tieOut:n.tieOut,x,y,direction:y<=top+16?-1:1});
       html+=`<text class="score-pitch-name" x="${x}" y="${noteBottom+30}" text-anchor="middle">${escape(p.name)}</text>`;
      }
      if(n.lyric)html+=`<text class="score-lyric" x="${x}" y="${lyricY}" text-anchor="middle">${escape(n.lyric)}</text>`;
      html+='</g>';
     }
     if(!score.unmetered){html+=`<path class="score-struct" d="M ${bx+barWidth} ${top} V ${bottom}"/>`;
      if(bar.index===bars.length-1)html+=`<path class="score-struct" d="M ${bx+barWidth-4} ${top} V ${bottom}"/>`;}
     bx+=barWidth;
    }
    for(let t=0;t<tiePoints.length;t++){
     const point=tiePoints[t],next=tiePoints[t+1],previous=tiePoints[t-1],tieY=point.y+point.direction*10,curveY=point.y+point.direction*23;
     if(point.tieOut){const end=next?.index===point.index&&next.tieIn?next.x-7:width-14;
      html+=`<g data-score-note="${point.index}"${point.index===currentIndex?' class="score-active"':''}><path class="score-stem" d="M ${point.x+7} ${tieY} Q ${(point.x+7+end)/2} ${curveY} ${end} ${tieY}"/></g>`;
     }
     if(point.tieIn&&previous?.index!==point.index){const begin=left+2,end=point.x-7;
      html+=`<g data-score-note="${point.index}"${point.index===currentIndex?' class="score-active"':''}><path class="score-stem" d="M ${begin} ${tieY} Q ${(begin+end)/2} ${curveY} ${end} ${tieY}"/></g>`;
     }
    }
    html+='</svg></div>';
   }
   scoreArea.innerHTML=html;
  }

  function stopNodes(){for(const node of nodes){try{node.osc.stop();}catch{}try{node.gain.disconnect();}catch{}}nodes.clear();}
  function highlight(index){if(currentIndex===index)return;scoreArea.querySelectorAll('.score-active').forEach(e=>e.classList.remove('score-active'));if(index>=0)scoreArea.querySelectorAll(`[data-score-note="${index}"]`).forEach(e=>e.classList.add('score-active'));currentIndex=index;}
  function phase(){return playing?Math.max(0,anchorBeat+(audioContext.currentTime-anchorTime)*settings.tempo/60):offset;}
  function updateControls(){start.disabled=playing;start.textContent=paused?'Pokračovať v melódii':'Prehrať melódiu';pauseButton.disabled=!playing;stopButton.disabled=!playing&&!paused;}
  function halt(){generation++;playing=false;cancelAnimationFrame(frame);stopNodes();updateControls();}
  function stop(){if(destroyed)return;halt();paused=false;offset=0;progress.value=0;highlight(-1);current.textContent='';status.textContent='Zastavené';updateControls();}
  function pause(){if(!playing||destroyed)return;offset=phase()%score.totalBeats;halt();paused=true;status.textContent='Pozastavené';updateControls();}
  function tone(midi,when,duration){
   if(duration<=0)return;
   const osc=audioContext.createOscillator(),gain=audioContext.createGain(),node={osc,gain};osc.setPeriodicWave(wave);osc.frequency.value=440*Math.pow(2,(midi-69)/12);
   const release=Math.min(.045,duration/3),attack=Math.min(.02,duration/4);
   gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(.115,when+attack);gain.gain.setValueAtTime(.115,when+duration-release);gain.gain.linearRampToValueAtTime(0,when+duration);
   osc.connect(gain);gain.connect(master);osc.start(when);osc.stop(when+duration+.01);nodes.add(node);
   osc.onended=()=>{nodes.delete(node);try{osc.disconnect();gain.disconnect();}catch{}};
  }
  function schedule(cycle){
   const secondsPerBeat=60/settings.tempo,cycleBase=cycle*score.totalBeats;
   for(const note of score.notes){if(note.midi===null)continue;
    const noteStart=cycleBase+note.start,noteEnd=noteStart+note.beats,begin=Math.max(noteStart,anchorBeat);
    if(noteEnd<=begin+1e-8)continue;
    const when=anchorTime+(begin-anchorBeat)*secondsPerBeat;
    tone(note.midi+settings.transpose,Math.max(audioContext.currentTime,when),(noteEnd-begin)*secondsPerBeat*.96);
   }
   scheduledCycle=cycle;
  }
  function tick(){
   if(!playing||destroyed)return;
   const elapsed=phase(),cycle=Math.floor(elapsed/score.totalBeats),beat=elapsed%score.totalBeats;
   if(!settings.repeat&&elapsed>=score.totalBeats){halt();paused=false;offset=0;highlight(-1);current.textContent='';status.textContent='Melódia dokončená';progress.value=100;updateControls();root.dispatchEvent(new CustomEvent('mantra-score:ended',{bubbles:true}));return;}
   if(settings.repeat&&scheduledCycle<=cycle&&(score.totalBeats-beat)*60/settings.tempo<.4)schedule(cycle+1);
   const note=score.notes.find(n=>beat>=n.start&&beat<n.start+n.beats);
   if(note){highlight(note.index);current.textContent=(note.midi===null?'Pauza':transformedPitch(note).name)+(note.lyric?' · '+note.lyric:'');}
   progress.value=beat/score.totalBeats*100;frame=requestAnimationFrame(tick);
  }
  async function play(){
   if(destroyed||playing)return;
   for(const other of instances)if(other!==instance)other.stop();
   const token=++generation;start.disabled=true;stopButton.disabled=false;status.textContent='Zapínam zvuk…';
   try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw new Error('Syntetický zvuk nie je dostupný v tomto prehliadači. Použi MIDI súbor.');
    if(!audioContext){audioContext=new Audio();const real=new Float32Array([0,1,.38,.20,.10,.07,.035]);wave=audioContext.createPeriodicWave(real,new Float32Array(real.length));}
    if(!master){master=audioContext.createGain();master.gain.value=.65;analyser=audioContext.createAnalyser();analyser.fftSize=2048;master.connect(analyser);analyser.connect(audioContext.destination);}
    await audioContext.resume();if(token!==generation||destroyed)return;
    if(audioContext.state!=='running')throw new Error('Zvuk sa nespustil. Skús znova tlačidlo Prehrať melódiu alebo stiahni MIDI.');
    root.dispatchEvent(new CustomEvent('mantra-score:play',{bubbles:true}));root.dispatchEvent(new CustomEvent('scoreplay',{bubbles:true}));
    playing=true;paused=false;anchorBeat=offset;anchorTime=audioContext.currentTime+.05;scheduledCycle=-1;status.textContent='Prehráva sa syntetická melódia';updateControls();schedule(0);frame=requestAnimationFrame(tick);
   }catch(error){if(token!==generation||destroyed)return;halt();status.textContent=error.message;updateControls();}
  }
  function change(){
   const newTempo=Number(tempo.value),newTranspose=Number(transpose.value);
   if(!Number.isInteger(newTempo)||newTempo<20||newTempo>240||!Number.isInteger(newTranspose)||newTranspose< -12||newTranspose>12){tempo.value=settings.tempo;transpose.value=settings.transpose;status.textContent='Tempo zvoľ od 20 do 240 BPM a transpozíciu od −12 do +12 poltónov.';return;}
   if(score.notes.some(n=>n.midi!==null&&(n.midi+newTranspose<0||n.midi+newTranspose>127))){transpose.value=settings.transpose;status.textContent='Táto transpozícia je mimo rozsahu MIDI.';return;}
   const resume=playing;if(playing)pause();
   settings={tempo:newTempo,transpose:newTranspose,repeat:repeat.checked};draw();if(resume)play();
  }
  function download(){
   const bytes=makeMidi(score,{...settings,meterVisible:score.meterVisible}),url=URL.createObjectURL(new Blob([bytes],{type:'audio/midi'})),a=document.createElement('a');
   a.href=url;a.download=String(score.id||'mantra').replace(/[^a-zA-Z0-9_-]/g,'-')+(settings.transpose?'_'+(settings.transpose>0?'+':'')+settings.transpose:'')+'.mid';root.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function onHidden(){if(document.hidden&&playing)pause();}
  function destroy(){if(destroyed)return;stop();destroyed=true;observer?.disconnect();document.removeEventListener('visibilitychange',onHidden);window.removeEventListener('pagehide',stop);master?.disconnect();analyser?.disconnect();instances.delete(instance);if(root.parentElement===container)root.remove();}
  const instance={play,pause,stop,destroy,getState:()=>({...settings,playing,paused,offset:phase(),totalBeats:score.totalBeats,currentIndex}),getMidiBytes:()=>makeMidi(score,{...settings,meterVisible:score.meterVisible}),getAudioPeak:()=>{if(!analyser)return 0;const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);return samples.reduce((peak,n)=>Math.max(peak,Math.abs(n)),0);}};
  start.addEventListener('click',play);pauseButton.addEventListener('click',pause);stopButton.addEventListener('click',stop);midiButton.addEventListener('click',download);
  for(const control of [tempo,transpose,repeat])control.addEventListener('change',change);
  document.addEventListener('visibilitychange',onHidden);window.addEventListener('pagehide',stop);
  const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(draw):null;observer?.observe(scoreArea);
  instances.add(instance);draw();return instance;
 }
 window.MantraScorePlayer={mount,stop:()=>{for(const instance of instances)instance.stop();},midiBytes:makeMidi,validate:normalize};
})();
