const FTMS_SERVICE='00001826-0000-1000-8000-00805f9b34fb';
const INDOOR_BIKE_DATA='00002ad2-0000-1000-8000-00805f9b34fb';
const CONTROL_POINT='00002ad9-0000-1000-8000-00805f9b34fb';
const HR_SERVICE='0000180d-0000-1000-8000-00805f9b34fb';
const HR_MEASUREMENT='00002a37-0000-1000-8000-00805f9b34fb';
const FIT_SDK_URL='https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/index.js';
const ACCESS_CODE='123456789!';

const $=id=>document.getElementById(id);
const state={
  screen:'login', workout:null, workoutSource:'workouts/current.json', workoutLabel:'360° Coach', workoutChoices:[],
  bike:'tri', riderKg:79, bikeKg:8, roadCda:.30, triCda:.23, crr:.005, rho:1.225,
  trainerDevice:null, trainerServer:null, ftms:null, bikeChar:null, controlChar:null,
  hrDevice:null, hrServer:null, hrChar:null, trainerConnected:false, hrConnected:false, ergReady:false,
  latestPower:0, latestCadence:null, latestHr:null, latestRawSpeed:null, powerEvents:[],
  sessionActive:false, paused:false, transitioning:false, currentStep:0, stepElapsedMs:0, activeElapsedMs:0,
  lastEngineTs:performance.now(), effectiveOffset:0, lastCountdownSecond:null, audioCtx:null,
  virtualSpeedMs:0, virtualDistanceM:0, simLastTs:performance.now(), speedTauUp:.65, speedTauDown:.55, coastDecelKmhPerSec:3,
  samples:[], recordTimer:null, sessionStartWall:null, sessionEndWall:null, lastFitBytes:null, lastFitFilename:null,
  autoFit:true, sound:true, dim:false, history:[], finishReason:'completed'
};

function log(msg){const t=new Date().toLocaleTimeString();$('debugLog').textContent+=`[${t}] ${msg}\n`; $('debugLog').scrollTop=$('debugLog').scrollHeight;}
function toast(msg){const el=$('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),2600)}
function fmt(sec){sec=Math.max(0,Math.round(sec));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`}
function de1(n){return Number(n||0).toFixed(1).replace('.',',')}
function avg(vals){const a=vals.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function totalWorkoutSec(){return state.workout?.steps?.reduce((s,x)=>s+Number(x.durationSec||0),0)||0}
function currentStep(){return state.workout?.steps?.[state.currentStep]||null}
function plannedPositionSec(){if(!state.workout)return 0;let sec=0;for(let i=0;i<state.currentStep;i++)sec+=Number(state.workout.steps[i]?.durationSec||0);return sec+state.stepElapsedMs/1000}
function effectiveTarget(step=currentStep()){return step?Math.max(0,Math.round(Number(step.targetPower||0)+state.effectiveOffset)):0}
function savePrefs(){localStorage.setItem('coachRidePrefs',JSON.stringify({bike:state.bike,riderKg:state.riderKg,bikeKg:state.bikeKg,roadCda:state.roadCda,triCda:state.triCda,autoFit:state.autoFit,sound:state.sound,dim:state.dim}))}
function loadPrefs(){try{Object.assign(state,JSON.parse(localStorage.getItem('coachRidePrefs')||'{}'))}catch{};try{state.history=JSON.parse(localStorage.getItem('coachRideHistory')||'[]')}catch{state.history=[]}}
function persistHistory(){localStorage.setItem('coachRideHistory',JSON.stringify(state.history.slice(0,30)))}

function showScreen(name){['Login','Menu','Ride','Summary'].forEach(x=>$('screen'+x).hidden=x.toLowerCase()!==name);state.screen=name;window.scrollTo(0,0)}
function syncPrefsUI(){
  $('toggleAutoFit').checked=!!state.autoFit;$('toggleSound').checked=!!state.sound;$('toggleDim').checked=!!state.dim;document.body.classList.toggle('dim',!!state.dim);
  $('bikeRoad').classList.toggle('active',state.bike==='road');$('bikeTri').classList.toggle('active',state.bike==='tri');
  $('settingRiderKg').value=state.riderKg;$('settingBikeKg').value=state.bikeKg;$('settingRoadCda').value=state.roadCda;$('settingTriCda').value=state.triCda;
}

async function fetchWorkout(path,label){
  const res=await fetch(`${path}?ts=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);
  const data=await res.json();if(!Array.isArray(data.steps)||!data.steps.length)throw new Error('Ungültiges Workout');
  return {...data,_path:path,_label:label};
}
async function loadWorkout(path='workouts/current.json',label='360° Coach'){
  if(state.sessionActive){toast('Workout kann während der Session nicht gewechselt werden.');return}
  try{state.workout=await fetchWorkout(path,label);state.workoutSource=path;state.workoutLabel=label;state.currentStep=0;state.effectiveOffset=0;log(`Workout geladen: ${state.workout.name}`);renderMenuWorkout();renderRideWorkout();updateChecklist();updateStartButton();}
  catch(e){state.workout=null;toast('Workout konnte nicht geladen werden.');log('WORKOUT FEHLER: '+e.message);renderMenuWorkout();updateChecklist();updateStartButton()}
}
async function loadWorkoutChoices(){
  const specs=[['workouts/current.json','Aktuelles Workout'],['workouts/tredict-bridge-test.json','Tredict Bridge Test']];const arr=[];
  for(const [p,l] of specs){try{arr.push(await fetchWorkout(p,l))}catch{}}
  state.workoutChoices=arr;renderWorkoutList();
}
function workoutPeak(){return state.workout?Math.max(...state.workout.steps.map(s=>Number(s.targetPower||0))):0}
function keyBlockText(){if(!state.workout)return '—';const m=state.workout.steps.reduce((a,b)=>Number(b.targetPower||0)>Number(a.targetPower||0)?b:a,state.workout.steps[0]);return `${m.name||'Block'} · ${fmt(m.durationSec)}`}
function renderMenuWorkout(){
  const w=state.workout;$('menuWorkoutName').textContent=w?.name||'Kein Workout geladen';$('menuKeyBlock').textContent=w?keyBlockText():'—';$('menuDuration').textContent=w?fmt(totalWorkoutSec()):'—';$('menuTarget').textContent=w?`${workoutPeak()} W`:'—';$('checkWorkoutText').textContent=w?`${w.name} · ${fmt(totalWorkoutSec())}`:'Kein Workout';renderWorkoutChart($('menuWorkoutChart'),false)
}
function renderWorkoutList(){const box=$('workoutList');box.innerHTML='';if(!state.workoutChoices.length){box.innerHTML='<p>Keine weiteren Workouts verfügbar.</p>';return}state.workoutChoices.forEach(w=>{const b=document.createElement('button');b.className='workout-choice';b.innerHTML=`<b>${escapeHtml(w.name)}</b><small>${w.steps.length} Blöcke · ${fmt(w.steps.reduce((s,x)=>s+x.durationSec,0))} · ${escapeHtml(w._label||'')}</small>`;b.onclick=async()=>{$('dialogWorkouts').close();await loadWorkout(w._path,w._label)};box.appendChild(b)})}
function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}

function renderWorkoutChart(svg,live){
  const w=state.workout;if(!w){svg.innerHTML='';return}const W=live?1200:1000,H=live?220:170,pad=live?32:22;const total=totalWorkoutSec();const peak=Math.max(200,workoutPeak()*1.25);let x=pad;let targetPath=`M ${pad} ${H-pad}`;let cursor=0;const fills=[];
  w.steps.forEach((s,i)=>{const x1=pad+(cursor/total)*(W-2*pad);cursor+=s.durationSec;const x2=pad+(cursor/total)*(W-2*pad);const y=H-pad-(Number(s.targetPower||0)/peak)*(H-2*pad);targetPath+=` L ${x1} ${y} L ${x2} ${y}`;fills.push(`<rect x="${x1}" y="${y}" width="${Math.max(1,x2-x1)}" height="${H-pad-y}" fill="${i===state.currentStep&&live?'#c8f2f6':'#e7eef3'}" opacity="${live?.7:.9}"/>`) });
  targetPath+=` L ${W-pad} ${H-pad}`;
  let actual='';if(live&&state.samples.length){const pts=state.samples.filter(s=>Number.isFinite(s.power)).map(s=>{const xx=pad+((Number.isFinite(s.planSec)?s.planSec:s.activeSec)/total)*(W-2*pad);const yy=H-pad-(s.power/peak)*(H-2*pad);return `${xx},${Math.max(pad,yy)}`});actual=pts.length>1?`<polyline points="${pts.join(' ')}" fill="none" stroke="#079ab2" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`:''}
  const progress=live?Math.min(total,plannedPositionSec()):0;const px=pad+(progress/total)*(W-2*pad);
  const grid=[.25,.5,.75,1].map(f=>{const y=H-pad-f*(H-2*pad);return `<line x1="${pad}" y1="${y}" x2="${W-pad}" y2="${y}" stroke="#dbe5ec" stroke-width="1"/>`}).join('');
  svg.innerHTML=`<line x1="${pad}" y1="${H-pad}" x2="${W-pad}" y2="${H-pad}" stroke="#a9bac6"/>${grid}${fills.join('')}<path d="${targetPath}" fill="none" stroke="#f4b51f" stroke-width="3" stroke-linejoin="round"/>${actual}${live?`<line x1="${px}" y1="${pad}" x2="${px}" y2="${H-pad}" stroke="#13bcd3" stroke-width="2" stroke-dasharray="7 5"/><circle cx="${px}" cy="${H-pad-(effectiveTarget()/peak)*(H-2*pad)}" r="7" fill="#13bcd3"/>`:''}`;
}

function updateConnectionUi(){
  $('trainerStatusText').textContent=state.trainerConnected?'Verbunden':'Nicht verbunden';$('trainerStatusText').className='status-text '+(state.trainerConnected?'on':'off');
  $('hrmStatusText').textContent=state.hrConnected?'Verbunden':'Nicht verbunden';$('hrmStatusText').className='status-text '+(state.hrConnected?'on':'off');
  $('rideTrainerStatus').classList.toggle('off',!state.trainerConnected);$('rideHrmStatus').classList.toggle('off',!state.hrConnected);$('rideErgStatus').classList.toggle('off',!state.ergReady);
  $('rideTrainerStatus').querySelector('small').textContent=state.trainerConnected?'Verbunden':'Getrennt';$('rideHrmStatus').querySelector('small').textContent=state.hrConnected?'Verbunden':'Getrennt';$('rideErgStatus').querySelector('small').textContent=state.ergReady?'Aktiv':'Nicht bereit';
  updateChecklist();updateStartButton();
}
function updateChecklist(){
  const loaded=!!state.workout,erg=state.ergReady;$('checkWorkoutIcon').textContent=loaded?'✓':'•';$('checkWorkoutIcon').classList.toggle('muted',!loaded);$('checkErgIcon').textContent=erg?'✓':'•';$('checkErgIcon').classList.toggle('muted',!erg);$('checkErgText').textContent=erg?'Smart Trainer ist bereit':'KICKR noch nicht bereit';
  const count=Number($('checkGarmin').checked)+Number($('checkGear').checked)+Number(loaded)+Number(erg);$('checkCount').textContent=`${count} / 4`;
}
function updateStartButton(){$('btnStartTraining').disabled=!(state.workout&&state.trainerConnected&&state.ergReady)}