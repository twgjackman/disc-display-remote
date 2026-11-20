/* Disc Display Remote production v1.6 — no diagnostic or bench-test protocol */
'use strict';
const SERVICE='aba54e10-58de-4f40-b0c8-d65de1250001';
const COMMAND='aba54e10-58de-4f40-b0c8-d65de1250002';
const STATUS='aba54e10-58de-4f40-b0c8-d65de1250003';
const CATALOGUE='aba54e10-58de-4f40-b0c8-d65de1250004';
const NOWPLAYING='aba54e10-58de-4f40-b0c8-d65de1250005';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const FRAME_ROWS=[
 [...Array(11)].map((_,i)=>i+1),[...Array(12)].map((_,i)=>i+12),
 [...Array(12)].map((_,i)=>i+24),[...Array(11)].map((_,i)=>i+36),
 [...Array(11)].map((_,i)=>i+47).concat(58)
];
const discPoints=[...Array(57)].map((_,i)=>({slot:i+1}));
const CREDIT_ROWS=['spppgggssps','gpppppsgpgsp','gspgpggggpgg','ggsggggpppg','gpsssgspsgg'];
const CREDIT=Object.fromEntries(CREDIT_ROWS.flatMap((s,r)=>[...s].map((v,i)=>[FRAME_ROWS[r][i],v])));
const BLANKS={3:3,10:4,13:1,20:1,23:2,26:1,28:1,44:1,45:4,48:1};
const pendingSelection={slot:null,until:0};
const blankCount=n=>BLANKS[n]||0;
const staticAlbums=new Map();
const salesInfo=new Map();
async function loadSalesMetadata(){
 try{
  const response=await fetch('./assets/sales-info.json');
  if(!response.ok)throw Error('Sales metadata '+response.status);
  const data=await response.json();
  for(const [key,value] of Object.entries(data.albums||{})){
   const slot=Number(key);
   if(Number.isInteger(slot)&&slot>=1&&slot<=61)salesInfo.set(slot,value);
  }
  renderInfo();
 }catch(error){console.warn('Sales metadata unavailable',error);renderInfo();}
}

let tracksRenderKey='';
async function loadAlbumMetadata(){
 try{
  const resp=await fetch('./assets/catalog.json');
  if(!resp.ok)throw Error('catalogue '+resp.status);
  const json=await resp.json();
  for(const album of json.albums||[]){
   if(Number.isInteger(album.slot)&&album.slot>=1&&album.slot<=61)staticAlbums.set(album.slot,album);
  }
  tracksRenderKey='';buildFrame();buildPortraitGrid();renderMeta();renderTracks();renderLibrary();renderLive();
 }catch(err){console.warn('Bundled track catalogue not available',err)}
}

const state={device:null,server:null,command:null,status:null,catalogueChar:null,nowPlayingChar:null,connected:false,
 slot:0,mode:1,carousel:false,playing:false,speaker:false,quiet:false,album:'',volume:32,seconds:0,duration:0,
 track:0,totalTracks:0,title:'',artist:'',printed:'',viewOverride:null,catalogue:new Map(),lastVolume:32};
let sendChain=Promise.resolve(),volumeTimer,toastTimer,fetching=false,gesture=null,artAvailable=true;
const decoder=new TextDecoder();const encoder=new TextEncoder();
// Motion events are used automatically in supporting browsers (including Chrome
// Android). Browsers requiring a separate user gesture may supply scroll-only
// reflections; no Settings switch or permission prompt is displayed.
const shimmer={travel:0,gamma:0,beta:0,x:0,y:0,z:0,raf:0,lastTouchY:null,scrollPositions:new WeakMap()};
function scheduleShimmer(){
 if(shimmer.raf)return;
 shimmer.raf=requestAnimationFrame(()=>{
  shimmer.raf=0;
  const motion=shimmer.gamma*2.4+shimmer.beta*.75+shimmer.x*5-shimmer.y*1.7;
  const angle=(((-10+shimmer.travel*.52+motion)%360)+360)%360;
  const value=angle.toFixed(2)+'deg';
  document.documentElement.style.setProperty('--prism-angle',value);
  for(const disc of document.querySelectorAll('.platinum-blank'))disc.style.setProperty('--prism-angle',value);
 });
}
function addShimmerTravel(distance){
 if(!Number.isFinite(distance)||Math.abs(distance)<.04)return;
 shimmer.travel+=distance;scheduleShimmer();
}
function initShimmer(){
 let lastWindowY=window.scrollY||0;
 window.addEventListener('scroll',()=>{
  const current=window.scrollY||document.documentElement.scrollTop||0;
  addShimmerTravel(current-lastWindowY);lastWindowY=current;
 },{passive:true});
 document.addEventListener('scroll',event=>{
  const el=event.target;
  if(!el||el===document||el===document.documentElement||!('scrollTop'in el))return;
  const current=Number(el.scrollTop)||0,previous=shimmer.scrollPositions.get(el);
  if(Number.isFinite(previous))addShimmerTravel(current-previous);
  shimmer.scrollPositions.set(el,current);
 },{capture:true,passive:true});
 window.addEventListener('wheel',event=>addShimmerTravel(event.deltaY*.35),{passive:true});
 document.addEventListener('touchstart',event=>{
  if(event.touches.length===1)shimmer.lastTouchY=event.touches[0].clientY;
 },{passive:true});
 document.addEventListener('touchmove',event=>{
  if(event.touches.length!==1||shimmer.lastTouchY===null)return;
  const current=event.touches[0].clientY;
  addShimmerTravel((shimmer.lastTouchY-current)*.32);shimmer.lastTouchY=current;
 },{passive:true});
 document.addEventListener('touchend',()=>{shimmer.lastTouchY=null},{passive:true});
 $('frameStage')?.addEventListener('pointermove',event=>{
  if(event.pointerType!=='mouse')return;
  const bounds=event.currentTarget.getBoundingClientRect();
  addShimmerTravel((event.clientX-bounds.left)/Math.max(1,bounds.width)*.9);
 },{passive:true});
 window.addEventListener('deviceorientation',event=>{
  if(!Number.isFinite(event.gamma)&&!Number.isFinite(event.beta))return;
  shimmer.gamma=Number.isFinite(event.gamma)?event.gamma:0;
  shimmer.beta=Number.isFinite(event.beta)?event.beta:0;
  scheduleShimmer();
 },{passive:true});
 window.addEventListener('devicemotion',event=>{
  const vector=event.accelerationIncludingGravity||event.acceleration;
  if(!vector||![vector.x,vector.y,vector.z].some(Number.isFinite))return;
  shimmer.x=Number.isFinite(vector.x)?vector.x:0;
  shimmer.y=Number.isFinite(vector.y)?vector.y:0;
  shimmer.z=Number.isFinite(vector.z)?vector.z:0;
  scheduleShimmer();
 },{passive:true});
 scheduleShimmer();
}

function flash(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function text(v){return String(v??'').trim()}
function pad(n){return String(n).padStart(2,'0')}
function formatSeconds(n){n=Math.max(0,Number(n)||0);return Math.floor(n/60)+':'+pad(Math.floor(n%60))}
function albumEntry(n){
 const slot=Number(n);const sd=state.catalogue.get(slot)||{};
 const local=staticAlbums.get(slot);
 return local?{...sd,...local,sdTracks:sd.tracks}:({...sd,slot,name:sd.name||'Album artwork',tracks:[]});
}
function albumName(n){const a=albumEntry(n);return a.name?.replace(/^\d{2}\s+/, '')||'Album artwork'}

function connected(){return Boolean(state.server&&state.server.connected&&state.command)}
function saveCatalogue(){try{localStorage.setItem('disc-display-catalog-v1',JSON.stringify([...state.catalogue.values()]));}catch(_){}}
function loadCatalogue(){try{const data=JSON.parse(localStorage.getItem('disc-display-catalog-v1')||'[]');for(const a of data)if(a&&Number.isInteger(a.slot))state.catalogue.set(a.slot,a)}catch(_){}}
function crop(el,n){
 const idx=Number(n)-1;
 if(!Number.isInteger(idx)||idx<0||idx>=61){
  el.style.backgroundImage='none';return;
 }
 // The Play screen uses the original square cover. Round disc thumbnails
 // use the PowerPoint's printed disc artwork, except slots 58..61,
 // which have no corresponding physical disc.
 const square=el.id==='playerCover'||el.id==='fullscreenCover'||idx>=57;
 const file=square?'covers-atlas.webp':'discs-v12.webp';
 const col=idx%8,row=Math.floor(idx/8);
 el.style.backgroundImage='url("./assets/'+file+'")';
 el.style.backgroundSize='800% 800%';
 el.style.backgroundPosition=(col/7*100)+'% '+(row/7*100)+'%';
 el.classList.toggle('special-cover',idx>=57&&el.id!=='playerCover');
}
function albumRingColour(n){
 const credit=CREDIT[Number(n)];
 return credit==='g'?'#edc54a':credit==='p'?'#f6f7f4':'#15191d';
}
function discElement(n,extra){
 const disc=document.createElement('div');
 disc.className='disc-image'+(extra?' '+extra:'');
 disc.style.setProperty('--credit-ring',albumRingColour(n));
 const inner=document.createElement('span');inner.textContent='◉';disc.append(inner);
 crop(disc,n);return disc;
}
function discButton(n,variant){
 const b=document.createElement('button');b.type='button';
 b.className=variant+'-disc-button'+(n===58?' live-disc-button':'');
 b.dataset.slot=String(n);
 if(n===58){
  b.setAttribute('aria-label','Live albums and special artwork');b.title='Live albums';
  const art=document.createElement('div');art.className='grammy-art';b.append(art);
  b.addEventListener('click',()=>openDialog('liveDialog'));return b;
 }
 b.setAttribute('aria-label','Select '+albumName(n));b.title=albumName(n);
 b.style.setProperty('--credit-ring',albumRingColour(n));
 for(let i=0;i<blankCount(n);i++){
  const blank=document.createElement('span');blank.className='platinum-blank';b.append(blank);
 }
 const ring=document.createElement('span');ring.className='disc-ring';ring.setAttribute('aria-hidden','true');b.append(ring);
 b.append(discElement(n,'disc-main'));
 b.addEventListener('click',()=>selectAlbum(n));return b;
}
function buildFrame(){
 const root=$('frameRows');root.replaceChildren();
 FRAME_ROWS.forEach((slots,i)=>{
  const row=document.createElement('div');row.className='frame-row';row.dataset.row=String(i);
  slots.forEach(n=>row.append(discButton(n,'frame')));root.append(row);
 });
 requestAnimationFrame(layoutLandscapeFrame);
}
function layoutLandscapeFrame(){
 const root=$('frameRows');if(!root?.clientWidth||!root.clientHeight)return;
 const W=root.clientWidth,H=root.clientHeight;
 const weightedMax=Math.max(...FRAME_ROWS.map(row=>row.length+row.reduce((sum,n)=>sum+blankCount(n)*.13,0)+(row.length-1)*.075));
 const D=Math.max(10,Math.floor(Math.min((W-4)/weightedMax,H/5*.91)));
 root.style.setProperty('--frame-disc-size',D+'px');
 for(const row of root.children){
  row.style.height=H/5+'px';
  for(const b of row.children){
   const n=Number(b.dataset.slot),layers=blankCount(n),shift=layers*D*.13;
   b.style.width=D+shift+'px';b.style.height=D+'px';b.style.setProperty('--disc-size',D+'px');
   const ring=b.querySelector('.disc-ring');
   if(ring){ring.style.left=shift+'px';ring.style.top='0px';}
   const art=b.querySelector('.disc-main,.grammy-art');
   if(art){const inset=ring?D*.012:0;art.style.left=(shift+inset)+'px';art.style.top=inset+'px';}
   b.querySelectorAll('.platinum-blank').forEach((x,i)=>{x.style.left=(i*D*.13)+'px';x.style.top='0px';});
  }
 }
}
function buildPortraitGrid(){
 const grid=$('portraitGrid');grid.replaceChildren();
 FRAME_ROWS.forEach((slots,i)=>{
  const col=document.createElement('div');col.className='portrait-column';col.dataset.row=String(i);
  slots.forEach(n=>col.append(discButton(n,'portrait')));grid.append(col);
 });
 requestAnimationFrame(layoutPortraitGrid);
}
function layoutPortraitGrid(){
 const grid=$('portraitGrid');if(!grid?.clientWidth||!grid.children.length)return;
 const D=Math.max(26,Math.floor((grid.clientWidth-18)/5));
 const step=D*.155,gap=Math.max(3,D*.045);
 // Reflective CDs expose their upper edges; printed artwork sits at the
 // bottom/front of each stack. All five final printed discs end level.
 const minima=FRAME_ROWS.map(row=>row.slice(1).reduce((sum,n)=>sum+D+gap+blankCount(n)*step,0));
 const lastCoverY=Math.max(...minima);
 const totalHeight=Math.ceil(lastCoverY+D+2);
 grid.style.height=totalHeight+'px';grid.style.setProperty('--portrait-disc-size',D+'px');
 FRAME_ROWS.forEach((row,ri)=>{
  const buttons=[...grid.children[ri].children];
  const distributedGap=(lastCoverY-minima[ri])/Math.max(1,row.length-1);
  let artY=0;
  buttons.forEach((b,i)=>{
   const n=row[i],layers=blankCount(n),upper=layers*step;
   b.style.left='0px';b.style.top=(artY-upper)+'px';
   b.style.width=D+'px';b.style.height=(D+upper)+'px';
   b.style.setProperty('--disc-size',D+'px');
   const ring=b.querySelector('.disc-ring');
   if(ring){ring.style.left='0px';ring.style.top=upper+'px';}
   const art=b.querySelector('.disc-main,.grammy-art');
   if(art){const inset=ring?D*.012:0;art.style.left=inset+'px';art.style.top=(upper+inset)+'px';}
   b.querySelectorAll('.platinum-blank').forEach((el,j)=>{el.style.left='0px';el.style.top=j*step+'px';});
   if(i<row.length-1)artY+=D+gap+distributedGap+blankCount(row[i+1])*step;
  });
 });
}
function renderMeta(){
 const n=state.slot,entry=albumEntry(n),name=albumName(n)||'Choose an album',detail=staticAlbums.get(n);
 const artist=detail?.artist||'';
 const year=detail?.year?' · '+detail.year:'';
 const title=detail?.title||name;
 $('portraitAlbum').textContent=n?title:'Choose a disc';
 $('portraitArtist').textContent=n?(artist?artist+year:'Album selected'):'Tap an album in the collection';
 $('portraitMeta').textContent=n>=58?'Live / special album':'';
 crop($('portraitDisc'),n);
 crop($('playerCover'),n);crop($('fullscreenCover'),n);$('artDialogTitle').textContent=(detail?.artist?detail.artist+' · ':'')+(detail?.title||name);
 $('albumLabel').textContent=n?(artist?artist+' · ':'')+title:'—';
 $('songTitle').textContent=state.title||((state.playing&&n)?title:'No track selected');
 $('songArtist').textContent=state.artist||artist||'—';
 $('modeCaption').textContent=['','E-ink display','LED display','Audio mode'][state.mode]||'Display';
 $('currentCaption').textContent=n?name:'No album selected';
 renderInfo();
 for(const b of document.querySelectorAll('.frame-disc-button,.portrait-disc-button')){
 const displayed=Number(b.dataset.slot);
 const active=displayed===(n>=58?58:n);
 b.classList.toggle('selected',active);
 b.setAttribute('aria-pressed',String(active));
 if(displayed===58)b.title=active?'Live album selected: '+name:'Browse live albums and special artwork';
}
}
// A single audio file may combine consecutive numbered performances.
// Preserve the source title and the file index; only the printed number advances.
function numberedTrackRows(tracks){
 let next=1;
 return tracks.map((record,index)=>{
  const title=text(record?.title);
  const explicit=[...title.matchAll(/(?:^|[,;&]\s*|\s&\s)(0?[1-9]|[12]\d|3\d)\s+(?=[\p{L}])/gu)].map(m=>Number(m[1]));
  let last=next;
  if(explicit.includes(next+1)){
   const consecutive=explicit.filter(n=>n>next&&n<=next+6).sort((a,b)=>a-b);
   for(const n of consecutive){if(n===last+1)last=n;}
  }
  const label=last>next?pad(next)+'–'+pad(last):pad(next);
  const result={record,index:index+1,label,start:next,end:last};
  next=last+1;return result;
 });
}
function roundedSignificantSales(value){
 const amount=Number(value);
 return Number.isFinite(amount)&&amount>0?Number(amount.toPrecision(3)):null;
}
function renderInfo(){
 const root=$('infoContent');if(!root)return;root.replaceChildren();
 const detail=salesInfo.get(Number(state.slot));
 if(!state.slot){
  const p=document.createElement('p');p.className='muted';
  p.textContent='Choose an album to view certifications and sales.';root.append(p);return;
 }
 if(!detail){
  const p=document.createElement('p');p.className='muted';
  p.textContent='No sales or certification figures are listed for this album.';root.append(p);return;
 }
 const certs=Array.isArray(detail.certifications)?detail.certifications:[];
 if(certs.length){
  const grid=document.createElement('div');grid.className='info-certifications';
  const regionOrder={US:0,UK:1,Ireland:2,Canada:3,Germany:4,France:5,Netherlands:6,Italy:7};
  for(const cert of [...certs].sort((a,b)=>(regionOrder[a.region]??20)-(regionOrder[b.region]??20))){
   const chip=document.createElement('span');chip.className='info-chip';
   chip.textContent=cert.region+' '+(cert.count>1?cert.count+'× ':'')+cert.award+(cert.kind==='single'?' · Single':'');
   grid.append(chip);
  }
  root.append(grid);
 }
 const sales=roundedSignificantSales(detail.minSales);
 if(sales!==null){
  const block=document.createElement('div');block.className='info-sales';
  const number=document.createElement('strong');
  number.textContent=sales.toLocaleString('en-GB',{maximumFractionDigits:0});
  const label=document.createElement('span');label.textContent='Certified sales';
  block.append(number,label);root.append(block);
 }
 for(const award of detail.awards||[]){
  const item=document.createElement('p');item.className='info-award';item.textContent=award;root.append(item);
 }
}
const collapsedTrackDiscs=new Map();
function renderTracks(){
 const a=albumEntry(state.slot);
 const source=Array.isArray(a.tracks)?a.tracks:[];
 const numbered=numberedTrackRows(source);
 const total=source.length||Number(state.totalTracks)||Number(a.sdTracks)||0;
 const logical=numbered.length?numbered[numbered.length-1].end:total;
 const key=[state.slot,state.track,state.title,total,source.length].join('|');
 if(tracksRenderKey===key)return;
 tracksRenderKey=key;
 $('trackCount').textContent=total?(logical>total?logical+' tracks · '+total+' recordings':total+' tracks'):'Tracks unavailable';
 const target=$('trackList');target.replaceChildren();
 if(!total){
  const p=document.createElement('p');p.className='muted';p.textContent='No track listing is available for this album.';target.append(p);return;
 }
 function makeRow(i){
  const info=numbered[i-1],record=source[i-1];
  const button=document.createElement('button');button.type='button';
  button.className='track-row'+(i===state.track?' active':'');
  const number=document.createElement('span');number.className='track-index';number.textContent=info?.label||pad(i);
  const title=document.createElement('span');title.textContent=record?.title||(i===state.track&&state.title?state.title:'Track '+pad(i));
  button.append(number,title);
  button.title='Direct track selection requires a BLE firmware command';
  button.addEventListener('click',()=>{
   if(i!==state.track)flash('Direct track selection needs a BLE firmware command. Use Previous/Next for now.');
  });
  return button;
 }
 const groups=[];
 for(let i=0;i<source.length;i++){
  const name=source[i]?.group||'';
  if(!groups.length||groups[groups.length-1].name!==name)groups.push({name,indices:[i+1]});
  else groups[groups.length-1].indices.push(i+1);
 }
 // Only albums with more than one disc/section receive independent folding headers.
 if(groups.length>1&&groups.some(g=>g.name)){
  groups.forEach((group,gi)=>{
   const foldKey=state.slot+':'+gi;
   const open=collapsedTrackDiscs.get(foldKey)!==false;
   const wrapper=document.createElement('section');wrapper.className='track-disc-group';
   const header=document.createElement('button');header.type='button';
   header.className='track-disc-toggle';header.setAttribute('aria-expanded',String(open));
   const panelId='track-disc-'+state.slot+'-'+gi;header.setAttribute('aria-controls',panelId);
   const label=document.createElement('span');label.className='track-disc-label';
   const discName=document.createElement('strong');discName.textContent='Disc '+(gi+1);
   label.append(discName);
   if(group.name){const subtitle=document.createElement('small');subtitle.textContent=group.name;label.append(subtitle);}
   const count=document.createElement('span');count.className='track-disc-count';
   count.textContent=group.indices.length+' tracks';
   const chevron=document.createElement('span');chevron.className='track-disc-chevron';chevron.textContent='⌄';
   header.append(label,count,chevron);
   const content=document.createElement('div');content.id=panelId;
   content.className='track-disc-list';content.hidden=!open;
   for(const i of group.indices)content.append(makeRow(i));
   header.addEventListener('click',()=>{
    const expanded=header.getAttribute('aria-expanded')==='true';
    header.setAttribute('aria-expanded',String(!expanded));
    content.hidden=expanded;
    collapsedTrackDiscs.set(foldKey,expanded?false:true);
   });
   wrapper.append(header,content);target.append(wrapper);
  });
 }else{
  for(let i=1;i<=Math.min(total,250);i++)target.append(makeRow(i));
 }
}
function renderSettings(){
 for(const b of document.querySelectorAll('[data-mode]')){
  const selected=Number(b.dataset.mode)===state.mode;
  b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));
 }
 for(const id of ['settingsCarousel','playerLoop']){
  const b=$(id);b.classList.toggle('on',state.carousel);b.setAttribute('aria-pressed',String(state.carousel));
  b.setAttribute('aria-label',state.carousel?'Carousel on · continuous albums':'Play once · carousel off');
  b.title=state.carousel?'Carousel on':'Play once';
 }
 $('quietState').textContent=state.quiet?'Quiet':'Normal';$('deviceName').textContent=state.device?.name||'Not connected';
 if(document.activeElement!==$('settingsVolume'))$('settingsVolume').value=state.volume;
 if(document.activeElement!==$('volumeSlider'))$('volumeSlider').value=state.volume;
 $('settingsVolumeValue').textContent=Math.round(state.volume/127*100)+'%';
}function renderPlayer(){
 const playing=!!state.playing,mute=state.volume===0;
 $('playPause').classList.toggle('is-playing',playing);$('playPause').setAttribute('aria-label',playing?'Pause':'Play');
 $('muteButton').classList.toggle('is-muted',mute);$('muteButton').setAttribute('aria-label',mute?'Unmute':'Mute');
 $('stereoMeters').classList.toggle('is-playing',playing);
 $('elapsedLabel').textContent=formatSeconds(state.seconds);
 $('durationLabel').textContent=state.duration?formatSeconds(state.duration):'—';
 const slider=$('seekBar');slider.max=String(Math.max(1,state.duration||100));
 slider.value=String(Math.min(state.seconds,state.duration||100));
 slider.setAttribute('aria-valuetext','Current position '+formatSeconds(state.seconds)+'. Seeking not yet available.');
}function isPortrait(){return matchMedia('(orientation:portrait)').matches}
function renderView(){
 const p=isPortrait(),audio=state.mode===3;
 const showPlayer=audio&&(state.viewOverride==='player'||(state.viewOverride!=='frame'&&(p||state.playing)));
 $('framePage').hidden=showPlayer||p;
 $('portraitPage').hidden=!p; // background remains mounted behind player layer
 $('playerPage').hidden=!showPlayer;
 $('toPlayer').hidden=!audio;$('portraitPlayerButton').hidden=!p;
 document.body.classList.toggle('landscape',!p);document.body.classList.toggle('connected',state.connected);
 document.body.classList.toggle('player-open',showPlayer&&p);
 document.body.classList.toggle('player-active',showPlayer);
 $('playerBack').hidden=p;
 if(!p&&!showPlayer)requestAnimationFrame(layoutLandscapeFrame);
 if(p)requestAnimationFrame(layoutPortraitGrid);
}function renderConnection(){
 const ok=connected();state.connected=ok;
 $('connectGate').hidden=ok;$('mainContent').hidden=!ok;
 $('linkButton').classList.toggle('online',ok);$('linkLabel').textContent=ok?'Connected':'Offline';
 if(!ok){$('gateMessage').textContent=state.device?'Not currently connected. Reconnect your previously authorised frame.':'Your collection is ready. Connect to control the physical display.';}
 renderView();
}
function render(){renderConnection();renderMeta();renderPlayer();renderSettings();renderTracks();renderView();}
function queueWrite(message){
 sendChain=sendChain.catch(()=>{}).then(async()=>{if(!connected())throw new Error('Not connected');await state.command.writeValueWithResponse(encoder.encode(message));return true;});
 return sendChain.catch(err=>{flash('Bluetooth command failed: '+err.message);return false;});
}
async function command(message){if(!connected()){flash('Connect to your frame first');return false}return queueWrite(message)}
function scheduleVolume(n){n=Math.max(0,Math.min(127,Math.round(n)));state.volume=n;renderSettings();renderPlayer();clearTimeout(volumeTimer);volumeTimer=setTimeout(()=>command('VOL:'+n),160);}
function applyStatus(raw){
 const obj={};for(const part of text(raw).split(';')){const idx=part.indexOf('=');if(idx>0)obj[part.slice(0,idx)]=part.slice(idx+1);}
 if(!Object.keys(obj).length)return;
 const oldMode=state.mode;
 if(obj.slot!==undefined&&Number.isFinite(Number(obj.slot))){
  const received=Number(obj.slot);
  if(pendingSelection.slot!==null&&received!==pendingSelection.slot&&Date.now()<pendingSelection.until){
   // An old BLE status must not roll back a user's first tap.
  }else{
   state.slot=received;
   if(received===pendingSelection.slot||Date.now()>=pendingSelection.until)pendingSelection.slot=null;
  }
 }
 if(obj.mode!==undefined)state.mode=Number(obj.mode)||1;
 if(obj.car!==undefined)state.carousel=obj.car==='1';
 if(obj.playing!==undefined)state.playing=obj.playing==='1';
 if(obj.bt!==undefined)state.speaker=obj.bt==='1';
 if(obj.quiet!==undefined)state.quiet=obj.quiet==='1';
 if(obj.volume!==undefined&&!Number.isNaN(Number(obj.volume)))state.volume=Number(obj.volume);
 if(obj.seconds!==undefined)state.seconds=Number(obj.seconds)||0;
 if(obj.track!==undefined)state.track=Number(obj.track)||0;
 if(obj.album!==undefined)state.album=obj.album;
 if(oldMode!==state.mode)state.viewOverride=null;
 render();
}
function applyNowPlaying(raw){
 try{const d=JSON.parse(text(raw));state.title=text(d.t);state.artist=text(d.a);state.printed=text(d.p);state.duration=Number(d.d)||0;state.totalTracks=Number(d.n)||0;
 if(Number.isFinite(Number(d.w)))state.track=Number(d.w);
 renderMeta();renderPlayer();renderTracks();
 }catch(e){console.warn('Unrecognised Now Playing payload',e);}
}
function disconnect(){
 try{state.server?.disconnect()}catch(_){}state.server=null;state.command=null;state.status=null;state.catalogueChar=null;state.nowPlayingChar=null;state.connected=false;renderConnection();
}
function onDisconnected(){disconnect();flash('Display disconnected. Reconnect when it is available.');}
async function attachDevice(dev){
 $('connectButton').disabled=true;$('connectButton').textContent='Connecting…';
 try{
  disconnect();state.device=dev;
  const server=await dev.gatt.connect();const service=await server.getPrimaryService(SERVICE);
  const cmd=await service.getCharacteristic(COMMAND);
  const status=await service.getCharacteristic(STATUS);
  const cat=await service.getCharacteristic(CATALOGUE);
  const np=await service.getCharacteristic(NOWPLAYING);
  dev.removeEventListener('gattserverdisconnected',onDisconnected);
  dev.addEventListener('gattserverdisconnected',onDisconnected);
  state.server=server;state.command=cmd;state.status=status;state.catalogueChar=cat;state.nowPlayingChar=np;
  status.addEventListener('characteristicvaluechanged',e=>applyStatus(decoder.decode(e.target.value)));
  np.addEventListener('characteristicvaluechanged',e=>applyNowPlaying(decoder.decode(e.target.value)));
  await status.startNotifications();await np.startNotifications();
  renderConnection();
  try{applyStatus(decoder.decode(await status.readValue()))}catch(_){}
  try{applyNowPlaying(decoder.decode(await np.readValue()))}catch(_){}
  command('TIME:'+Math.floor(Date.now()/1000));
  flash('Connected to '+dev.name);
  void fetchCatalogue();
 }catch(err){disconnect();$('gateMessage').textContent='Could not connect: '+err.message;}
 finally{$('connectButton').disabled=false;$('connectButton').textContent='Connect to Disc Display';}
}
async function connectPicker(){
 if(!navigator.bluetooth){$('gateMessage').textContent='Web Bluetooth is unavailable here. Open this HTTPS app in Chrome on Android or a compatible desktop browser.';return;}
 try{const device=await navigator.bluetooth.requestDevice({filters:[{namePrefix:'Disc Display Remote'}],optionalServices:[SERVICE]});await attachDevice(device);}
 catch(err){if(err.name!=='NotFoundError')$('gateMessage').textContent='Connection not completed: '+err.message;}
}
async function reconnectGranted(){
 if(!navigator.bluetooth?.getDevices)return false;
 try{const granted=(await navigator.bluetooth.getDevices()).filter(d=>d.name?.startsWith('Disc Display Remote'));
 if(!granted.length)return false;
 $('retryButton').hidden=false;
 if(!state.connected){state.device=granted[0];$('gateMessage').textContent='Previously authorised frame found. You can reconnect without choosing it again.';}
 return true;
 }catch(_){return false;}
}
async function fetchCatalogue(){
 if(fetching||!connected())return;fetching=true;
 try{let count=62;const fetched=new Map();
  for(let page=0;page<Math.min(35,Math.ceil(count/3));page++){
   if(!connected())break;
   const sent=await command('PAGE:'+page);if(!sent)break;
   let raw='',valid=false;
   for(let attempt=0;attempt<5;attempt++){await wait(140);raw=decoder.decode(await state.catalogueChar.readValue());if(raw.startsWith('page='+page+';')){valid=true;break;}}
   if(!valid)continue;
   const lines=raw.split('\n');const m=lines.shift()||'';const countMatch=/count=(\d+)/.exec(m);if(countMatch)count=Number(countMatch[1])||count;
   for(const line of lines){const fields=line.split('|');if(fields.length<2)continue;const slot=Number(fields[0]);if(!Number.isInteger(slot))continue;const name=text(fields[1]);const tracks=Number(fields[2])||0;fetched.set(slot,{slot,name,tracks});}
  }
  for(const a of fetched.values())state.catalogue.set(a.slot,a);
  saveCatalogue();renderMeta();renderLibrary();renderLive();renderTracks();
 }catch(err){console.warn('Album catalogue unavailable',err);}
 finally{fetching=false;}
}
function selectAlbum(n){n=Number(n);if(!Number.isInteger(n)||n<0||n>99)return;state.slot=n;pendingSelection.slot=n;pendingSelection.until=Date.now()+4200;
 if(state.mode===3)state.viewOverride='player';
 command('ALBUM:'+n).then(ok=>{if(!ok)pendingSelection.slot=null});
 render();for(const d of ['libraryDialog','liveDialog'])closeDialog(d);
}
function openDialog(id){const el=$(id);if(id==='libraryDialog')renderLibrary();if(id==='liveDialog')renderLive();if(!el.open)el.showModal();}
function closeDialog(id){const el=$(id);if(el?.open)el.close();}
function sheetRow(n){const a=albumEntry(n);const button=document.createElement('button');button.type='button';button.className='sheet-item';const art=discElement(n);
 const details=document.createElement('span');details.className='sheet-item-text';const title=document.createElement('strong');title.textContent=a.title||albumName(n);const sub=document.createElement('small');const count=Array.isArray(a.tracks)?a.tracks.length:Number(a.tracks)||0;sub.textContent=(a.artist?a.artist+' · ':'')+(a.year||'')+(n>=58?' · Live / special':'')+(count?' · '+count+' tracks':'');details.append(title,sub);
 const arrow=document.createElement('span');arrow.className='chevron';arrow.textContent='›';button.append(art,details,arrow);button.addEventListener('click',()=>selectAlbum(n));return button;
}
function searchHeading(value,kind='result-heading'){
 const el=document.createElement('h3');el.className=kind;el.textContent=value;return el;
}
function renderLibrary(){
 const q=text($('librarySearch').value).toLocaleLowerCase().trim();
 const root=$('libraryList');root.replaceChildren();
 const src=staticAlbums.size?[...staticAlbums.values()].sort((a,b)=>a.slot-b.slot):[...state.catalogue.values()].sort((a,b)=>a.slot-b.slot);
 const albums=src.filter(a=>!q||[a.artist,a.title,a.name].some(v=>text(v).toLocaleLowerCase().includes(q)));
 const tracks=q?src.flatMap(a=>numberedTrackRows(Array.isArray(a.tracks)?a.tracks:[])
  .map(t=>({album:a,title:t.record.title||'',index:t.index,label:t.label}))
  .filter(t=>t.title.toLocaleLowerCase().includes(q))):[];
 root.append(searchHeading('Albums'+(q?' · '+albums.length:'')));
 let artist='';
 for(const album of albums){
  const name=album.artist||'Other artists';
  if(name!==artist){artist=name;root.append(searchHeading(name,'result-artist'));}
  root.append(sheetRow(album.slot));
 }
 if(!albums.length){
  const p=document.createElement('p');p.className='no-result-line';p.textContent='No matching album or artist';root.append(p);
 }
 if(q){
  root.append(Object.assign(document.createElement('hr'),{className:'search-divider'}));
  root.append(searchHeading('Tracks · '+tracks.length));
  artist='';let album=-1;let groupBody=null;
  for(const match of tracks){
   const who=match.album.artist||'Other artists';
   if(who!==artist){artist=who;album=-1;root.append(searchHeading(who,'result-artist'));}
   if(match.album.slot!==album){
    album=match.album.slot;
    const group=document.createElement('div');group.className='search-album-group';
    const artButton=document.createElement('button');artButton.type='button';artButton.className='search-album-thumb';
    artButton.setAttribute('aria-label','Select '+(match.album.title||match.album.name));
    artButton.append(discElement(match.album.slot,'search-track-disc'));
    artButton.addEventListener('click',()=>selectAlbum(match.album.slot));
    groupBody=document.createElement('div');groupBody.className='search-album-matches';
    groupBody.append(searchHeading(match.album.title||match.album.name,'result-album'));
    group.append(artButton,groupBody);root.append(group);
   }
   const button=document.createElement('button');button.type='button';button.className='search-track';
   const number=document.createElement('span');number.textContent=match.label;
   const title=document.createElement('span');title.textContent=match.title;
   button.append(number,title);
   button.addEventListener('click',()=>{
    selectAlbum(match.album.slot);closeDialog('libraryDialog');
    flash('Album selected; jumping to a specific track needs a firmware command.');
   });
   groupBody.append(button);
  }
  if(!tracks.length){
   const p=document.createElement('p');p.className='no-result-line';p.textContent='No matching track titles';root.append(p);
  }
  root.classList.toggle('empty-search',!albums.length&&!tracks.length);
 }else root.classList.remove('empty-search');
}
function renderLive(){const root=$('liveList');root.replaceChildren();let slots=[58,59,60,61];const detected=[...state.catalogue.keys()].filter(n=>n>57&&n<100);if(detected.length)slots=detected;for(const n of slots)root.append(sheetRow(n));}
function setPlayback(){command(state.playing?'PAUSE':'PLAY');state.playing=!state.playing;renderPlayer();renderView();}
function prevAlbum(){let s=state.slot-1;if(s<1||s>57)s=57;selectAlbum(s);}
function nextAlbum(){let s=state.slot+1;if(s<1||s>57)s=1;selectAlbum(s);}
function toggleCarousel(){command('CAROUSEL');state.carousel=!state.carousel;renderSettings();}
function showPlayer(){
 if(state.mode!==3){state.mode=3;command('MODE:3');}
 state.viewOverride='player';render();
}
function hidePlayer(){state.viewOverride='frame';renderView();}
function updateSearchViewport(){
 const vv=window.visualViewport;
 if(vv){
  document.documentElement.style.setProperty('--search-vh',Math.max(140,Math.floor(vv.height))+'px');
  document.documentElement.style.setProperty('--search-top',Math.max(6,Math.floor(vv.offsetTop)+8)+'px');
 }
}
function explainCarousel(){
 const mode=state.mode;
 const title=mode===1?'Carousel · E-ink':mode===2?'Carousel · LED':'Carousel · Audio';
 let description='';
 if(mode===1){
  description='When on, the display advances to the next album artwork automatically after the chosen interval. When off, it keeps the selected artwork. The interval starts at 60 minutes for each new carousel session.';
 }else if(mode===2){
  description='When on, the illuminated album selection advances automatically after the chosen interval. When off, the selected album stays active. The interval starts at 60 minutes for each new carousel session.';
 }else{
  description='When on, the next album starts when the current album finishes. There is no timed change in Audio mode. When off, the player does not automatically advance to the next album.';
 }
 $('carouselHelpTitle').textContent=title;
 $('carouselHelpStatus').textContent=state.carousel?'Carousel is currently ON':'Carousel is currently OFF (play once)';
 $('carouselHelpText').textContent=description;
 const dlg=$('carouselHelpDialog');if(!dlg.open)dlg.showModal();
}
function setupCarouselHold(buttonId){
 const button=$(buttonId);let timer=null,openedAt=0;
 const cancel=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
 button.addEventListener('pointerdown',event=>{
  if(event.pointerType==='mouse'&&event.button!==0)return;
  cancel();
  timer=setTimeout(()=>{
   timer=null;openedAt=Date.now();explainCarousel();
  },550);
 });
 button.addEventListener('pointerup',cancel);
 button.addEventListener('pointercancel',cancel);
 button.addEventListener('pointerleave',cancel);
 button.addEventListener('contextmenu',event=>{
  event.preventDefault();cancel();openedAt=Date.now();explainCarousel();
 });
 button.addEventListener('click',event=>{
  if(Date.now()-openedAt<900){event.preventDefault();event.stopPropagation();return;}
  cancel();toggleCarousel();
 });
 button.addEventListener('keydown',event=>{
  if(event.key==='F10'&&event.shiftKey){
   event.preventDefault();cancel();openedAt=Date.now();explainCarousel();
  }
 });
}
function wire(){
 initShimmer();
 updateSearchViewport();
 if(window.visualViewport){
  window.visualViewport.addEventListener('resize',updateSearchViewport);
  window.visualViewport.addEventListener('scroll',updateSearchViewport);
 }
 $('connectButton').addEventListener('click',connectPicker);
 $('retryButton').addEventListener('click',async()=>{if(state.device)await attachDevice(state.device);else connectPicker()});
 $('linkButton').addEventListener('click',()=>{if(connected())openDialog('settingsDialog');else if(state.device)attachDevice(state.device);else connectPicker()});
 $('settingsButton').addEventListener('click',()=>openDialog('settingsDialog'));
 $('frameSettingsButton').addEventListener('click',()=>openDialog('settingsDialog'));
 for(const b of document.querySelectorAll('.close-dialog'))b.addEventListener('click',()=>closeDialog(b.dataset.close));
 for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close()});
 $('portraitSearch').addEventListener('click',()=>{updateSearchViewport();openDialog('libraryDialog');$('librarySearch').focus({preventScroll:true})});
 $('librarySearch').addEventListener('input',renderLibrary);
 $('portraitPlayerButton').addEventListener('click',showPlayer);
 $('toPlayer').addEventListener('click',showPlayer);
 $('playerBack').addEventListener('click',hidePlayer);
 const grabber=$('playerGrabber'),drawer=$('playerPage');
 let drawerGesture=null,drawerFinishing=false;
 function settleDrawer(shouldDismiss){
  if(drawerFinishing||!drawerGesture)return;
  drawerGesture=null;
  drawer.style.transition='transform 250ms cubic-bezier(.2,.7,.25,1)';
  drawer.classList.add('drawer-moving');
  if(shouldDismiss){
   drawerFinishing=true;
   drawer.style.transform='translate3d(0,100dvh,0)';
   const finish=()=>{
    hidePlayer();drawer.style.transition='';drawer.style.transform='';
    drawer.classList.remove('drawer-moving');drawerFinishing=false;
   };
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
   else window.setTimeout(finish,260);
  }else{
   drawer.style.transform='translate3d(0,0,0)';
   window.setTimeout(()=>{
    drawer.style.transition='';drawer.style.transform='';
    drawer.classList.remove('drawer-moving');
   },260);
  }
 }
 grabber.addEventListener('pointerdown',e=>{
  if(!isPortrait()||drawerFinishing||$('playerPage').hidden)return;
  drawer.style.transition='none';
  drawerGesture={pointerId:e.pointerId,startY:e.clientY,distance:0};
  try{grabber.setPointerCapture(e.pointerId)}catch(_){}
 });
 grabber.addEventListener('pointermove',e=>{
  if(!drawerGesture||e.pointerId!==drawerGesture.pointerId)return;
  const dist=Math.max(0,e.clientY-drawerGesture.startY);
  drawerGesture.distance=dist;drawer.style.transform='translate3d(0,'+dist+'px,0)';
  if(dist>0)e.preventDefault();
 });
 grabber.addEventListener('pointerup',e=>{
  if(!drawerGesture||e.pointerId!==drawerGesture.pointerId)return;
  const threshold=Math.min(170,Math.max(105,window.innerHeight*.20));
  settleDrawer(drawerGesture.distance>threshold);
 });
 grabber.addEventListener('pointercancel',()=>settleDrawer(false));
 grabber.addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();hidePlayer();}
 });
 $('artZone').addEventListener('click',()=>openDialog('artDialog'));
 $('playPause').addEventListener('click',setPlayback);
 $('previousTrack').addEventListener('click',()=>command('PREV'));
 $('nextTrack').addEventListener('click',()=>command('NEXTTRACK'));
 setupCarouselHold('playerLoop');
 setupCarouselHold('settingsCarousel');
 $('carouselHelpClose').addEventListener('click',()=>$('carouselHelpDialog').close());
 $('carouselHelpDialog').addEventListener('click',event=>{if(event.target===$('carouselHelpDialog'))$('carouselHelpDialog').close();});
 for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{
  const m=Number(b.dataset.mode);state.mode=m;state.viewOverride=null;command('MODE:'+m);render();
 });
 $('slower').addEventListener('click',()=>{command('SLOWER');flash('Carousel speed reduced')});
 $('faster').addEventListener('click',()=>{command('FASTER');flash('Carousel speed increased')});
 $('settingsVolume').addEventListener('input',e=>scheduleVolume(Number(e.target.value)));
 $('volumeSlider').addEventListener('input',e=>scheduleVolume(Number(e.target.value)));
 $('muteButton').addEventListener('click',()=>{
  if(state.volume>0){state.lastVolume=state.volume;scheduleVolume(0)}
  else scheduleVolume(Math.max(1,state.lastVolume));renderPlayer();
 });
 $('settingsDisconnect').addEventListener('click',()=>{closeDialog('settingsDialog');disconnect()});
 $('seekBar').addEventListener('input',e=>{e.target.value=String(state.seconds);flash('Seeking needs a BLE firmware update; no seek command sent.')});
 $('seekBar').addEventListener('change',e=>e.target.value=String(state.seconds));
 window.addEventListener('orientationchange',()=>setTimeout(()=>{renderView();layoutPortraitGrid();layoutLandscapeFrame()},160));
 window.addEventListener('resize',()=>{renderView();layoutPortraitGrid();layoutLandscapeFrame()});
 document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  const opened=document.querySelectorAll('dialog[open]');
  if(opened.length)for(const d of opened)d.close();
  else if(!$('playerPage').hidden)hidePlayer();
 });
}
async function init(){
 loadCatalogue();buildFrame();buildPortraitGrid();wire();renderLibrary();renderLive();render();void loadAlbumMetadata();void loadSalesMetadata();
 if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
 if(!navigator.bluetooth){$('gateMessage').textContent='Web Bluetooth is not supported in this browser. Use Chrome on Android or a compatible desktop browser over HTTPS.';}
 await reconnectGranted();
}
document.addEventListener('DOMContentLoaded',init);
