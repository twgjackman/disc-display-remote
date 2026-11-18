/* Disc Display Remote production v1.1 — no diagnostic or bench-test protocol */
'use strict';
const SERVICE='aba54e10-58de-4f40-b0c8-d65de1250001';
const COMMAND='aba54e10-58de-4f40-b0c8-d65de1250002';
const STATUS='aba54e10-58de-4f40-b0c8-d65de1250003';
const CATALOGUE='aba54e10-58de-4f40-b0c8-d65de1250004';
const NOWPLAYING='aba54e10-58de-4f40-b0c8-d65de1250005';
const $=id=>document.getElementById(id);
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const positions=[
 [153,152,264,371,477,587,696,808,917,1027,1162,1318],
 [331,152,263,371,482,587,695,800,901,1010,1114,1217,1319],
 [514,152,258,374,477,589,698,803,907,1015,1120,1218,1322],
 [696,150,258,374,482,589,698,800,907,1019,1156,1320],
 [872,151,262,372,479,587,694,808,912,1027,1133,1217]
];
const discPoints=[];let slot=1;
for(const row of positions){const y=row[0];for(const x of row.slice(1))discPoints.push({slot:slot++,x,y});}
const pointFor=id=>discPoints.find(d=>d.slot===Number(id));
const staticAlbums=new Map();
let tracksRenderKey='';
async function loadAlbumMetadata(){
 try{
  const resp=await fetch('./assets/catalog.json');
  if(!resp.ok)throw Error('catalogue '+resp.status);
  const json=await resp.json();
  for(const album of json.albums||[]){
   if(Number.isInteger(album.slot)&&album.slot>=1&&album.slot<=61)staticAlbums.set(album.slot,album);
  }
  tracksRenderKey='';
  renderMeta();renderTracks();renderLibrary();renderLive();
 }catch(err){console.warn('Bundled track catalogue not available',err)}
}

const state={device:null,server:null,command:null,status:null,catalogueChar:null,nowPlayingChar:null,connected:false,
 slot:0,mode:1,carousel:false,playing:false,speaker:false,quiet:false,album:'',volume:32,seconds:0,duration:0,
 track:0,totalTracks:0,title:'',artist:'',printed:'',viewOverride:null,catalogue:new Map(),lastVolume:32};
let sendChain=Promise.resolve(),volumeTimer,toastTimer,fetching=false,gesture=null,artAvailable=true;
const decoder=new TextDecoder();const encoder=new TextEncoder();
function flash(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3200);}
function text(v){return String(v??'').trim()}
function pad(n){return String(n).padStart(2,'0')}
function formatSeconds(n){n=Math.max(0,Number(n)||0);return Math.floor(n/60)+':'+pad(Math.floor(n%60))}
function albumEntry(n){
 const slot=Number(n);const sd=state.catalogue.get(slot)||{};
 const local=staticAlbums.get(slot);
 return local?{...sd,...local,sdTracks:sd.tracks}:({...sd,slot,name:sd.name||('Disc '+pad(slot)),tracks:[]});
}
function albumName(n){const a=albumEntry(n);return a.name?.replace(/^\d{2}\s+/, '')||'Disc '+pad(n)}

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
 const square=el.id==='playerCover'||idx>=57;
 const file=square?'covers-atlas.webp':'discs-atlas.webp';
 const col=idx%8,row=Math.floor(idx/8);
 el.style.backgroundImage='url("./assets/'+file+'")';
 el.style.backgroundSize='800% 800%';
 el.style.backgroundPosition=(col/7*100)+'% '+(row/7*100)+'%';
 el.classList.toggle('special-cover',idx>=57&&el.id!=='playerCover');
}
function discElement(n,extra){const disc=document.createElement('div');disc.className='disc-image'+(extra?' '+extra:'');const inner=document.createElement('span');inner.textContent='◉';disc.append(inner);crop(disc,n);return disc;}
function buildFrame(){
 const root=$('hotspots');root.replaceChildren();
 for(const p of discPoints){const b=document.createElement('button');b.type='button';b.className='disc-hotspot';b.style.left=(100*p.x/1470).toFixed(3)+'%';b.style.top=(100*p.y/1024).toFixed(3)+'%';b.dataset.slot=p.slot;b.title='Select disc '+pad(p.slot);b.setAttribute('aria-label','Select disc '+pad(p.slot));b.addEventListener('click',()=>selectAlbum(p.slot));root.append(b);}
 const e=document.createElement('button');e.type='button';e.className='eink-hotspot';e.style.left=(100*1316/1470).toFixed(3)+'%';e.style.top=(100*870/1024).toFixed(3)+'%';e.setAttribute('aria-label','Choose a live album / non-disc artwork');e.title='Live albums and special artwork';e.addEventListener('click',()=>openDialog('liveDialog'));root.append(e);
 const fallback=$('frameFallback');
 for(const row of positions){const r=document.createElement('div');r.className='fallback-row';for(let j=1;j<row.length;j++){const d=document.createElement('div');d.className='fallback-disc '+((j%3===0)?'gold':(j%3===1)?'black':'');d.textContent='◉';r.append(d);}fallback.append(r);}
 $('frameImage').addEventListener('error',()=>{$('frameImage').hidden=true;fallback.hidden=false;artAvailable=false;flash('Using simplified frame view until artwork is available.')},{once:true});
}
function buildPortraitGrid(){
 const grid=$('portraitGrid');grid.replaceChildren();
 for(const p of discPoints){const button=document.createElement('button');button.type='button';button.dataset.slot=p.slot;const disc=discElement(p.slot);const name=document.createElement('small');name.className='disc-label';name.textContent=pad(p.slot);button.append(disc,name);button.addEventListener('click',()=>selectAlbum(p.slot));grid.append(button);}
}
function renderMeta(){
 const n=state.slot,entry=albumEntry(n),name=albumName(n)||'Choose an album',detail=staticAlbums.get(n);
 const artist=detail?.artist||'';
 const year=detail?.year?' · '+detail.year:'';
 const title=detail?.title||name;
 $('frameSelected').textContent=n?pad(n)+' · '+name:'Select a disc';
 $('portraitAlbum').textContent=n?title:'Choose a disc';
 $('portraitArtist').textContent=n?(artist?artist+year:'Disc '+pad(n)):'Tap an album in the collection';
 $('portraitMeta').textContent=n>=58?'Live/special album · no physical disc':(n?'Physical disc '+pad(n):'The frame contains 57 physical discs');
 crop($('portraitDisc'),n);
 crop($('playerCover'),n);
 $('albumLabel').textContent=n?(artist?artist+' · ':'')+title+' · '+pad(n):'—';
 $('songTitle').textContent=state.title||((state.playing&&n)?title:'No track selected');
 $('songArtist').textContent=state.artist||artist||'—';
 $('miniTitle').textContent=state.title||title;
 $('miniArtist').textContent=state.artist||artist||'Disc Display';
 $('modeCaption').textContent=['','E-ink display','LED display','Audio mode'][state.mode]||'Display';
 $('currentCaption').textContent=n?pad(n)+' · '+name:'No disc selected';
 for(const b of document.querySelectorAll('.disc-hotspot')){const active=Number(b.dataset.slot)===n;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
 for(const b of document.querySelectorAll('#portraitGrid button')){b.querySelector('.disc-image')?.classList.toggle('selected',Number(b.dataset.slot)===n);}
}
function renderTracks(){
 const a=albumEntry(state.slot);
 const source=Array.isArray(a.tracks)?a.tracks:[];
 const total=source.length||Number(state.totalTracks)||Number(a.sdTracks)||0;
 const key=[state.slot,state.track,state.title,total,source.length].join('|');
 if(tracksRenderKey===key)return;
 tracksRenderKey=key;
 $('trackCount').textContent=total?total+' tracks':'Tracks unavailable';
 const target=$('trackList');target.replaceChildren();
 if(!total){const p=document.createElement('p');p.className='muted';p.textContent='No track listing is available for this album.';target.append(p);return;}
 let group='';
 for(let i=1;i<=Math.min(total,250);i++){
  const record=source[i-1];
  if(record?.group&&record.group!==group){
   group=record.group;
   const heading=document.createElement('p');heading.className='track-group';heading.textContent=group;target.append(heading);
  }
  const b=document.createElement('button');b.type='button';b.className='track-row'+(i===state.track?' active':'');
  const id=document.createElement('span');id.className='track-index';id.textContent=pad(i);
  const title=document.createElement('span');title.textContent=record?.title||(i===state.track&&state.title?state.title:'Track '+pad(i));
  b.append(id,title);
  b.title='View track in source listing; direct track selection is awaiting firmware support';
  b.addEventListener('click',()=>{if(i!==state.track)flash('Direct track selection needs a BLE firmware update. Use Previous/Next for now.');});
  target.append(b);
 }
}
function renderSettings(){
 for(const b of document.querySelectorAll('[data-mode]')){const selected=Number(b.dataset.mode)===state.mode;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));}
 $('settingsCarousel').classList.toggle('on',state.carousel);$('settingsCarousel').setAttribute('aria-checked',String(state.carousel));
 $('playerLoop').classList.toggle('on',state.carousel);$('playerLoop').setAttribute('aria-pressed',String(state.carousel));
 $('quietState').textContent=state.quiet?'Quiet':'Normal';
 $('deviceName').textContent=state.device?.name||'Not connected';
 if(document.activeElement!==$('settingsVolume'))$('settingsVolume').value=state.volume;
 if(document.activeElement!==$('volumeSlider'))$('volumeSlider').value=state.volume;
 $('settingsVolumeValue').textContent=Math.round(state.volume/127*100)+'%';
 $('volumeText').textContent=Math.round(state.volume/127*100)+'%';
}
function renderPlayer(){
 $('playPause').textContent=state.playing?'Ⅱ':'▶';$('playPause').setAttribute('aria-label',state.playing?'Pause':'Play');
 $('miniPlay').textContent=state.playing?'Ⅱ':'▶';
 $('elapsedLabel').textContent=formatSeconds(state.seconds);
 $('durationLabel').textContent=state.duration?formatSeconds(state.duration):'—';
 const slider=$('seekBar');slider.max=String(Math.max(1,state.duration||100));slider.value=String(Math.min(state.seconds,state.duration||100));slider.setAttribute('aria-valuetext','Current position '+formatSeconds(state.seconds)+'. Seeking not yet available.');
}
function isPortrait(){return matchMedia('(orientation:portrait)').matches}
function renderView(){
 const p=isPortrait(),audio=state.mode===3,showPlayer=audio&&(state.viewOverride==='player'||(state.viewOverride!=='frame'&&(p||state.playing)));
 $('framePage').hidden=showPlayer||p;
 $('portraitPage').hidden=showPlayer||!p;
 $('playerPage').hidden=!showPlayer;
 $('miniPlayer').hidden=!(audio&&!showPlayer&&state.playing);
 $('toPlayer').hidden=!audio;
 $('portraitPlayerButton').hidden=!audio;
 $('framePage').classList.toggle('audio-visible',audio);
 document.body.classList.toggle('landscape',!p);document.body.classList.toggle('connected',state.connected);
 $('playerBack').textContent=p?'← Display':'← Frame';
}
function renderConnection(){
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
function scheduleVolume(n){n=Math.max(0,Math.min(127,Math.round(n)));state.volume=n;renderSettings();clearTimeout(volumeTimer);volumeTimer=setTimeout(()=>command('VOL:'+n),160);}
function applyStatus(raw){
 const obj={};for(const part of text(raw).split(';')){const idx=part.indexOf('=');if(idx>0)obj[part.slice(0,idx)]=part.slice(idx+1);}
 if(!Object.keys(obj).length)return;
 const oldMode=state.mode;
 if(obj.slot!==undefined&&Number.isFinite(Number(obj.slot)))state.slot=Number(obj.slot);
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
function selectAlbum(n){n=Number(n);if(!Number.isInteger(n)||n<0||n>99)return;state.slot=n;
 if(state.mode===3)state.viewOverride='player';
 command('ALBUM:'+n);render();for(const d of ['libraryDialog','liveDialog'])closeDialog(d);
}
function openDialog(id){const el=$(id);if(id==='libraryDialog')renderLibrary();if(id==='liveDialog')renderLive();if(!el.open)el.showModal();}
function closeDialog(id){const el=$(id);if(el?.open)el.close();}
function sheetRow(n){const a=albumEntry(n);const button=document.createElement('button');button.type='button';button.className='sheet-item';const art=discElement(n);
 const details=document.createElement('span');details.className='sheet-item-text';const title=document.createElement('strong');title.textContent=a.title||albumName(n);const sub=document.createElement('small');const count=Array.isArray(a.tracks)?a.tracks.length:Number(a.tracks)||0;sub.textContent=(a.artist?a.artist+' · ':'')+(a.year||'')+(n>=58?' · Live/special':' · Disc '+pad(n))+(count?' · '+count+' tracks':'');details.append(title,sub);
 const arrow=document.createElement('span');arrow.className='chevron';arrow.textContent='›';button.append(art,details,arrow);button.addEventListener('click',()=>selectAlbum(n));return button;
}
function renderLibrary(){
 const q=text($('librarySearch').value).toLowerCase(),root=$('libraryList');root.replaceChildren();
 let matches=0;
 for(const p of discPoints){const a=albumEntry(p.slot);if(q&&!((pad(p.slot)+' '+(a.artist||'')+' '+(a.title||'')+' '+(a.name||'')+' '+(a.year||'')).toLowerCase().includes(q)))continue;root.append(sheetRow(p.slot));matches++;}
 if(!matches){const p=document.createElement('p');p.className='muted';p.textContent='No matching discs';root.append(p);}
}
function renderLive(){const root=$('liveList');root.replaceChildren();let slots=[58,59,60,61];const detected=[...state.catalogue.keys()].filter(n=>n>57&&n<100);if(detected.length)slots=detected;for(const n of slots)root.append(sheetRow(n));}
function setPlayback(){command(state.playing?'PAUSE':'PLAY');state.playing=!state.playing;renderPlayer();renderView();}
function prevAlbum(){let s=state.slot-1;if(s<1||s>57)s=57;selectAlbum(s);}
function nextAlbum(){let s=state.slot+1;if(s<1||s>57)s=1;selectAlbum(s);}
function toggleCarousel(){command('CAROUSEL');state.carousel=!state.carousel;renderSettings();}
function wire(){
 $('connectButton').addEventListener('click',connectPicker);
 $('retryButton').addEventListener('click',async()=>{if(state.device)await attachDevice(state.device);else connectPicker();});
 $('linkButton').addEventListener('click',()=>{if(connected())openDialog('settingsDialog');else if(state.device)attachDevice(state.device);else connectPicker();});
 $('settingsButton').addEventListener('click',()=>openDialog('settingsDialog'));
 for(const b of document.querySelectorAll('.close-dialog'))b.addEventListener('click',()=>closeDialog(b.dataset.close));
 for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d)d.close()});
 $('openLibrary').addEventListener('click',()=>openDialog('libraryDialog'));
 $('portraitBrowse').addEventListener('click',()=>openDialog('libraryDialog'));
 $('portraitSearch').addEventListener('click',()=>{openDialog('libraryDialog');$('librarySearch').focus()});
 $('librarySearch').addEventListener('input',renderLibrary);
 $('openLive').addEventListener('click',()=>openDialog('liveDialog'));
 $('portraitLive').addEventListener('click',()=>openDialog('liveDialog'));
 $('portraitNext').addEventListener('click',nextAlbum);$('portraitPrev').addEventListener('click',prevAlbum);
 $('portraitPlayerButton').addEventListener('click',()=>{state.viewOverride='player';renderView()});
 $('toPlayer').addEventListener('click',()=>{state.viewOverride='player';renderView()});
 $('miniOpen').addEventListener('click',()=>{state.viewOverride='player';renderView()});
 $('playerBack').addEventListener('click',()=>{state.viewOverride='frame';renderView()});
 $('miniPlay').addEventListener('click',setPlayback);$('playPause').addEventListener('click',setPlayback);
 $('previousTrack').addEventListener('click',()=>command('PREV'));$('nextTrack').addEventListener('click',()=>command('NEXTTRACK'));
 $('playerLoop').addEventListener('click',toggleCarousel);$('settingsCarousel').addEventListener('click',toggleCarousel);
 for(const b of document.querySelectorAll('[data-mode]'))b.addEventListener('click',()=>{const m=Number(b.dataset.mode);state.mode=m;state.viewOverride=null;command('MODE:'+m);render();});
 $('slower').addEventListener('click',()=>{command('SLOWER');flash('Carousel speed reduced');});
 $('faster').addEventListener('click',()=>{command('FASTER');flash('Carousel speed increased');});
 $('settingsVolume').addEventListener('input',e=>scheduleVolume(Number(e.target.value)));
 $('volumeSlider').addEventListener('input',e=>scheduleVolume(Number(e.target.value)));
 $('muteButton').addEventListener('click',()=>{if(state.volume>0){state.lastVolume=state.volume;scheduleVolume(0)}else scheduleVolume(Math.max(1,state.lastVolume));});
 $('volumeDown').addEventListener('click',()=>scheduleVolume(state.volume-8));
 $('volumeUp').addEventListener('click',()=>scheduleVolume(state.volume+8));
 $('settingsDisconnect').addEventListener('click',()=>{closeDialog('settingsDialog');disconnect();});
 $('seekBar').addEventListener('input',e=>{e.target.value=String(state.seconds);flash('Seeking needs a BLE firmware update; no seek command sent.');});
 $('seekBar').addEventListener('change',e=>e.target.value=String(state.seconds));
 const zone=$('artZone');
 zone.addEventListener('pointerdown',e=>{gesture={x:e.clientX,y:e.clientY,startVolume:state.volume,kind:null};try{zone.setPointerCapture(e.pointerId)}catch(_){}});
 zone.addEventListener('pointermove',e=>{if(!gesture)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
 if(!gesture.kind&&Math.max(Math.abs(dx),Math.abs(dy))>18)gesture.kind=Math.abs(dy)>Math.abs(dx)*1.2?'volume':'seek';
 if(gesture.kind==='volume'){const vol=Math.max(0,Math.min(127,gesture.startVolume-Math.round(dy/2)));scheduleVolume(vol);$('gestureVolume').textContent='Volume '+Math.round(vol/127*100)+'%';$('gestureVolume').hidden=false;}
 });
 const endGesture=()=>{if(gesture?.kind==='seek')flash('Horizontal seeking requires a firmware BLE command.');gesture=null;$('gestureVolume').hidden=true;};
 zone.addEventListener('pointerup',endGesture);zone.addEventListener('pointercancel',endGesture);
 window.addEventListener('orientationchange',()=>setTimeout(renderView,160));
 window.addEventListener('resize',renderView);
 document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const d of document.querySelectorAll('dialog[open]'))d.close()});
}
async function init(){
 loadCatalogue();buildFrame();buildPortraitGrid();wire();renderLibrary();renderLive();render();void loadAlbumMetadata();
 if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
 if(!navigator.bluetooth){$('gateMessage').textContent='Web Bluetooth is not supported in this browser. Use Chrome on Android or a compatible desktop browser over HTTPS.';}
 await reconnectGranted();
}
document.addEventListener('DOMContentLoaded',init);
