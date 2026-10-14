async function buildAndValidateFit(){
  const box=$('summaryFit');if(state.samples.length<2||!state.sessionStartWall){box.textContent='Zu wenige Daten für FIT.';return false}box.textContent='FIT wird erzeugt und validiert …';
  try{const {Encoder,Decoder,Stream,Profile}=await import(FIT_SDK_URL);const encoder=new Encoder(),start=state.sessionStartWall,end=state.sessionEndWall||new Date(),duration=Math.max(1,state.activeElapsedMs/1000);encoder.writeMesg({mesgNum:Profile.MesgNum.FILE_ID,manufacturer:'development',product:1,serialNumber:360001,timeCreated:start,type:'activity'});encoder.writeMesg({mesgNum:Profile.MesgNum.EVENT,timestamp:start,event:'timer',eventType:'start'});
    for(const s of state.samples){const rec={mesgNum:Profile.MesgNum.RECORD,timestamp:s.timestamp,distance:s.distance,speed:s.speed,enhancedSpeed:s.speed};if(Number.isFinite(s.power))rec.power=Math.round(s.power);if(Number.isFinite(s.cadence))rec.cadence=Math.round(s.cadence);if(Number.isFinite(s.heartRate))rec.heartRate=Math.round(s.heartRate);encoder.writeMesg(rec)}encoder.writeMesg({mesgNum:Profile.MesgNum.EVENT,timestamp:end,event:'timer',eventType:'stopAll'});
    const p=state.samples.map(x=>x.power),h=state.samples.map(x=>x.heartRate),c=state.samples.map(x=>x.cadence),sp=state.samples.map(x=>x.speed);const common={timestamp:end,startTime:start,totalElapsedTime:duration,totalTimerTime:duration,totalDistance:state.virtualDistanceM,sport:'cycling',subSport:'indoorCycling',avgSpeed:avg(sp),maxSpeed:Math.max(...sp.filter(Number.isFinite),0),avgPower:avg(p),maxPower:Math.max(...p.filter(Number.isFinite),0),avgCadence:avg(c),maxCadence:Math.max(...c.filter(Number.isFinite),0),avgHeartRate:avg(h),maxHeartRate:Math.max(...h.filter(Number.isFinite),0)};encoder.writeMesg({mesgNum:Profile.MesgNum.LAP,messageIndex:0,...common});encoder.writeMesg({mesgNum:Profile.MesgNum.SESSION,messageIndex:0,...common,firstLapIndex:0,numLaps:1});encoder.writeMesg({mesgNum:Profile.MesgNum.ACTIVITY,timestamp:end,totalTimerTime:duration,numSessions:1});const bytes=encoder.close();const decoder=new Decoder(Stream.fromByteArray(Array.from(bytes))),isFit=decoder.isFIT(),integrity=decoder.checkIntegrity();state.lastFitBytes=bytes;state.lastFitFilename=`${start.toISOString().slice(0,10)}-${safeName(state.workout?.name)}.fit`;box.textContent=isFit&&integrity?`FIT validiert ✓ · ${bytes.length} Bytes`:'FIT erzeugt, Validierung prüfen';$('btnShareFit').disabled=!(isFit&&integrity);log(`FIT: isFIT=${isFit} integrity=${integrity}`);return isFit&&integrity}
  catch(e){box.textContent='FIT-Erzeugung fehlgeschlagen. Garmin-Aufzeichnung bleibt der Normalweg.';log('FIT FEHLER: '+e.message);return false}
}
function safeName(s){return String(s||'ride').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'ride'}
async function shareFit(){if(!state.lastFitBytes)return;const file=new File([state.lastFitBytes],state.lastFitFilename||'360-coach-ride.fit',{type:'application/octet-stream'});try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'360° Coach Ride FIT'});else{const url=URL.createObjectURL(file),a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}}catch(e){if(e.name!=='AbortError')toast('FIT konnte nicht geteilt werden')}}

function showSummary(){const ap=avgPower(),np=normalizedPower();$('summaryTitle').textContent=state.finishReason==='completed'?'Training abgeschlossen':'Training beendet';$('summaryTime').textContent=fmt(state.activeElapsedMs/1000);$('summaryDistance').textContent=`${de1(state.virtualDistanceM/1000)} km`;$('summaryAvg').textContent=Number.isFinite(ap)?`${Math.round(ap)} W`:'—';$('summaryNp').textContent=Number.isFinite(np)?`${Math.round(np)} W`:'—';$('summaryFit').textContent=state.autoFit?'FIT wird vorbereitet …':'Auto-FIT ist deaktiviert.';$('btnShareFit').disabled=true;showScreen('summary')}
function renderHistory(){const box=$('historyList');box.innerHTML='';if(!state.history.length){box.innerHTML='<p>Noch keine lokalen Sessions gespeichert.</p>';return}state.history.forEach(h=>{const d=document.createElement('div');d.className='history-item';d.innerHTML=`<b>${escapeHtml(h.name)}</b><small>${new Date(h.date).toLocaleString('de-DE')} · ${fmt(h.timeSec)} · ${de1(h.distanceKm)} km · Ø ${Number.isFinite(h.avgPower)?Math.round(h.avgPower):'—'} W · NP ${Number.isFinite(h.np)?Math.round(h.np):'—'} W ${h.completed?'✓':'(beendet)'}</small>`;box.appendChild(d)})}

function checkConnections(){state.trainerConnected=!!state.trainerDevice?.gatt?.connected;state.hrConnected=!!state.hrDevice?.gatt?.connected;state.ergReady=state.trainerConnected&&!!state.controlChar;updateConnectionUi();toast(`KICKR ${state.trainerConnected?'✓':'✗'} · HRM ${state.hrConnected?'✓':'✗'}`)}
function saveSettings(){state.riderKg=Number($('settingRiderKg').value)||79;state.bikeKg=Number($('settingBikeKg').value)||8;state.roadCda=Number($('settingRoadCda').value)||.30;state.triCda=Number($('settingTriCda').value)||.23;savePrefs();$('dialogSettings').close();toast('Einstellungen gespeichert')}

$('loginForm').addEventListener('submit',e=>{e.preventDefault();if($('accessCode').value===ACCESS_CODE){sessionStorage.setItem('painCaveUnlocked','1');$('loginError').hidden=true;showScreen('menu')}else{$('loginError').hidden=false;$('accessCode').select()}});
$('btnWorkoutChange').onclick=()=>{renderWorkoutList();$('dialogWorkouts').showModal()};$('btnTrainerConnect').onclick=connectTrainer;$('btnHrmConnect').onclick=connectHRM;$('rideTrainerStatus').onclick=()=>{if(!state.trainerConnected)connectTrainer()};$('rideHrmStatus').onclick=()=>{if(!state.hrConnected)connectHRM()};$('btnCheckConnections').onclick=checkConnections;$('btnConnectionsQuick').onclick=checkConnections;$('btnReloadWorkout').onclick=()=>loadWorkout(state.workoutSource,state.workoutLabel);$('btnStartTraining').onclick=startTraining;$('btnMinus5').onclick=()=>adjustTarget(-5);$('btnPlus5').onclick=()=>adjustTarget(5);$('btnSkip').onclick=skipStep;$('btnPause').onclick=togglePause;$('btnEndRide').onclick=()=>$('dialogConfirmEnd').showModal();$('confirmEndRide').onclick=e=>{e.preventDefault();$('dialogConfirmEnd').close();finishWorkout('aborted')};$('btnShareFit').onclick=shareFit;$('btnBackMenu').onclick=()=>{showScreen('menu');renderMenuWorkout();updateChecklist();updateStartButton()};
$('bikeRoad').onclick=()=>{if(state.sessionActive)return;state.bike='road';syncPrefsUI();savePrefs()};$('bikeTri').onclick=()=>{if(state.sessionActive)return;state.bike='tri';syncPrefsUI();savePrefs()};
$('checkGarmin').onchange=()=>{updateChecklist();updateStartButton()};$('checkGear').onchange=()=>{updateChecklist();updateStartButton()};$('toggleAutoFit').onchange=e=>{state.autoFit=e.target.checked;savePrefs()};$('toggleSound').onchange=e=>{state.sound=e.target.checked;savePrefs()};$('toggleDim').onchange=e=>{state.dim=e.target.checked;syncPrefsUI();savePrefs()};$('btnHistory').onclick=()=>{renderHistory();$('dialogHistory').showModal()};$('btnSettings').onclick=()=>{$('dialogSettings').showModal()};$('btnSaveSettings').onclick=saveSettings;document.querySelectorAll('[data-close-dialog]').forEach(b=>b.onclick=()=>$(b.dataset.closeDialog).close());

let debugTaps=0,debugTimer=null;document.querySelectorAll('.brand-copy span').forEach(el=>el.addEventListener('click',()=>{debugTaps++;clearTimeout(debugTimer);debugTimer=setTimeout(()=>debugTaps=0,1400);if(debugTaps>=5){$('debugDrawer').hidden=false;debugTaps=0}}));$('btnCloseDebug').onclick=()=>$('debugDrawer').hidden=true;

loadPrefs();syncPrefsUI();loadWorkout('workouts/current.json','360° Coach');loadWorkoutChoices();updateConnectionUi();if(sessionStorage.getItem('painCaveUnlocked')==='1')showScreen('menu');else showScreen('login');log('360° Coach Ride UI v1 geladen.');

window.addEventListener('beforeunload',e=>{if(state.sessionActive){e.preventDefault();e.returnValue='';}});

/* --------------------------------------------------------------------------
   URL routing patch
   --------------------------------------------------------------------------
   We deliberately keep Login, Menu, Ride and Summary in ONE browser document.
   A real HTML-page reload would tear down the active Web Bluetooth GATT
   connections to KICKR/HRM. History routes give each view its own URL/state
   while preserving BLE and the running workout in memory.
*/
const _showScreenBase=showScreen;
const ROUTE_HASH={login:'',menu:'#/menu',ride:'#/ride',summary:'#/summary'};
let _routeApplying=false;

function currentRoute(){
  const h=(location.hash||'').replace(/^#\/?/,'').toLowerCase();
  return ['menu','ride','summary'].includes(h)?h:'login';
}
function routeUrl(name){return `${location.pathname}${location.search}${ROUTE_HASH[name]||''}`}
function setRouteUrl(name,replace=false){
  const fn=replace?'replaceState':'pushState';
  history[fn]({screen:name},'',routeUrl(name));
}
showScreen=function(name,options={}){
  const target=['login','menu','ride','summary'].includes(name)?name:'login';
  _showScreenBase(target);
  if(!_routeApplying&&!options.noHistory)setRouteUrl(target,!!options.replace);
};

function guardedRoute(requested){
  const unlocked=sessionStorage.getItem('painCaveUnlocked')==='1';
  if(requested==='login')return 'login';
  if(!unlocked)return 'login';
  if(requested==='menu')return 'menu';
  if(requested==='ride')return state.sessionActive?'ride':'menu';
  if(requested==='summary')return state.sessionEndWall?'summary':'menu';
  return 'login';
}
function applyRouteFromUrl({replaceInvalid=true,fromBrowserNav=false}={}){
  const requested=currentRoute();

  // Never let browser Back/URL editing silently leave an active workout.
  if(state.sessionActive&&requested!=='ride'){
    _routeApplying=true;
    _showScreenBase('ride');
    setRouteUrl('ride',true);
    _routeApplying=false;
    if(fromBrowserNav&&!$('dialogConfirmEnd').open)$('dialogConfirmEnd').showModal();
    return;
  }

  const target=guardedRoute(requested);
  _routeApplying=true;
  _showScreenBase(target);
  if(target!==requested&&replaceInvalid)setRouteUrl(target,true);
  _routeApplying=false;
}

window.addEventListener('popstate',()=>applyRouteFromUrl({fromBrowserNav:true}));
window.addEventListener('hashchange',()=>applyRouteFromUrl({fromBrowserNav:true}));

// Reconcile the URL after the legacy bootstrap above. A direct attempt to
// open #/menu, #/ride or #/summary without the code is sent back to Login.
applyRouteFromUrl({replaceInvalid:true});
log('URL-Routing aktiv: Login → Hauptmenü → Ride → Summary.');

/* Focused live-ride enhancement layer. Kept separate from BLE/ERG/session core. */
(function loadRideEnhancements(){
  if(document.querySelector('script[data-ride-enhancements]'))return;
  const s=document.createElement('script');s.src=`ride-enhancements-v1.js?v=1.0.0`;s.async=false;s.dataset.rideEnhancements='1';document.body.appendChild(s);
})();
