function startRecording(){clearInterval(state.recordTimer);captureSample();state.recordTimer=setInterval(captureSample,1000)}
function stopRecording(){clearInterval(state.recordTimer);state.recordTimer=null}
function captureSample(){if(!state.sessionActive||state.paused)return;state.samples.push({timestamp:new Date(),activeSec:state.activeElapsedMs/1000,planSec:plannedPositionSec(),power:Number.isFinite(state.latestPower)?state.latestPower:null,cadence:Number.isFinite(state.latestCadence)?state.latestCadence:null,heartRate:Number.isFinite(state.latestHr)?state.latestHr:null,speed:state.virtualSpeedMs,distance:state.virtualDistanceM,stepIndex:state.currentStep,targetPower:effectiveTarget()});updateRideStats()}
function resetSession(){state.previewMode=false;document.getElementById('previewBadge')?.remove();state.samples=[];state.sessionStartWall=new Date();state.sessionEndWall=null;state.activeElapsedMs=0;state.stepElapsedMs=0;state.currentStep=0;state.effectiveOffset=0;state.lastCountdownSecond=null;state.virtualSpeedMs=0;state.virtualDistanceM=0;state.latestPower=0;state.latestCadence=null;state.latestHr=null;state.latestRawSpeed=null;state.lastFitBytes=null;state.lastFitFilename=null;state.finishReason='completed';state.lastEngineTs=performance.now();state.powerEvents=[]}
async function startTraining(){
  if(!state.workout||!state.trainerConnected||!state.ergReady){toast('KICKR und Workout müssen bereit sein.');return}
  await ensureAudio();resetSession();state.paused=false;showScreen('ride');renderRideWorkout();
  try{await requestControl();await setTargetPower(effectiveTarget())}catch(e){toast('ERG Start fehlgeschlagen');log('ERG START: '+e.message);showScreen('menu');return}
  state.sessionActive=true;state.lastEngineTs=performance.now();startRecording();log('Session gestartet.');
}
async function engineTick(){
  const now=performance.now(),dt=Math.min(500,Math.max(0,now-state.lastEngineTs));state.lastEngineTs=now;if(!state.sessionActive)return;if(!state.paused&&!state.transitioning){state.activeElapsedMs+=dt;state.stepElapsedMs+=dt;const s=currentStep();if(s){const remaining=Math.max(0,s.durationSec-state.stepElapsedMs/1000);handleCountdown(remaining);if(remaining<=0&&!state.transitioning)await advanceStep('AUTO')}}updateRideUi()}
setInterval(engineTick,100);
async function advanceStep(reason){if(state.transitioning||!state.sessionActive)return;state.transitioning=true;state.lastCountdownSecond=null;state.currentStep++;state.stepElapsedMs=0;state.effectiveOffset=0;if(state.currentStep>=state.workout.steps.length){await finishWorkout('completed');state.transitioning=false;return}try{await setTargetPower(effectiveTarget());playTransitionTone();log(`${reason}: Schritt ${state.currentStep+1}`)}catch(e){log('Step transition error: '+e.message)}state.lastEngineTs=performance.now();renderRideWorkout();state.transitioning=false}
async function skipStep(){if(!state.sessionActive||state.paused)return;await advanceStep('SKIP')}
async function adjustTarget(delta){if(!state.sessionActive||state.paused)return;state.effectiveOffset+=delta;try{await setTargetPower(effectiveTarget());toast(`Zielleistung ${effectiveTarget()} W`)}catch(e){state.effectiveOffset-=delta;toast('Zielleistung konnte nicht geändert werden')}renderRideWorkout()}
async function togglePause(){
  if(!state.sessionActive)return;if(!state.paused){state.paused=true;try{await setTargetPower(100)}catch{};$('btnPause').innerHTML='<svg class="control-icon"><use href="#i-play"/></svg><span><b>FORTSETZEN</b><small>Training weiterführen</small></span>';toast('Training pausiert');}
  else{if(!state.trainerConnected||!state.ergReady){toast('KICKR zuerst neu verbinden');return}try{await requestControl();await setTargetPower(effectiveTarget())}catch{toast('ERG konnte nicht fortgesetzt werden');return}state.paused=false;state.lastEngineTs=performance.now();$('btnPause').innerHTML='<svg class="control-icon"><use href="#i-pause"/></svg><span><b>PAUSE</b><small>Training anhalten</small></span>';toast('Training fortgesetzt')}
}
async function finishWorkout(reason='aborted'){
  if(!state.sessionActive)return;state.sessionActive=false;state.paused=false;state.finishReason=reason;stopRecording();state.sessionEndWall=new Date();try{await setTargetPower(100)}catch{};log(`Session beendet: ${reason}`);updateRideUi();
  const historyItem={date:state.sessionStartWall?.toISOString(),name:state.workout?.name||'Ride',timeSec:state.activeElapsedMs/1000,distanceKm:state.virtualDistanceM/1000,avgPower:avgPower(),np:normalizedPower(),completed:reason==='completed'};state.history.unshift(historyItem);persistHistory();
  showSummary();if(state.autoFit)await buildAndValidateFit();
}
function remainingWorkoutSec(){if(!state.workout)return 0;let sec=Math.max(0,(currentStep()?.durationSec||0)-state.stepElapsedMs/1000);for(let i=state.currentStep+1;i<state.workout.steps.length;i++)sec+=state.workout.steps[i].durationSec;return sec}

function handleCountdown(remaining){if(!state.sound)return;const n=Math.ceil(remaining);if(n<=5&&n>=1&&n!==state.lastCountdownSecond){state.lastCountdownSecond=n;showCountdown(n);playBeep(n===1?1000:720,.09)}if(remaining>5.2)state.lastCountdownSecond=null}
function showCountdown(n){$('countdownNumber').textContent=n;$('countdownLabel').textContent=state.workout?.steps?.[state.currentStep+1]?'Nächster Block':'Training Ende';$('countdownOverlay').hidden=false;clearTimeout(showCountdown._t);showCountdown._t=setTimeout(()=>$('countdownOverlay').hidden=true,850)}
async function ensureAudio(){if(!state.sound)return;try{if(!state.audioCtx)state.audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(state.audioCtx.state==='suspended')await state.audioCtx.resume()}catch(e){log('Audio unavailable: '+e.message)}}
function playBeep(freq=720,dur=.08){if(!state.sound||!state.audioCtx)return;const o=state.audioCtx.createOscillator(),g=state.audioCtx.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.001,state.audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.16,state.audioCtx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.001,state.audioCtx.currentTime+dur);o.connect(g).connect(state.audioCtx.destination);o.start();o.stop(state.audioCtx.currentTime+dur+.02)}
function playTransitionTone(){if(!state.sound)return;playBeep(1100,.12);setTimeout(()=>playBeep(1450,.15),150)}

function renderRideWorkout(){
  const s=currentStep(),next=state.workout?.steps?.[state.currentStep+1];$('rideTargetPower').textContent=s?`${effectiveTarget()} W`:'— W';$('rideBlockIndex').textContent=state.workout?`${Math.min(state.currentStep+1,state.workout.steps.length)} / ${state.workout.steps.length}`:'— / —';$('rideBlockName').textContent=s?.name||'Fertig';$('rideBlockPrescription').textContent=s?`${fmt(s.durationSec)} @ ${effectiveTarget()} W`:'—';$('rideBlockNote').textContent=s?.note||s?.description||'';$('rideRpe').textContent=`RPE: ${Number.isFinite(Number(s?.expectedRpe))?s.expectedRpe:'—'}/10`;$('rideNextIndex').textContent=next?`${state.currentStep+2} / ${state.workout.steps.length}`:'—';$('rideNextName').textContent=next?.name||'Workout-Ende';$('rideNextPrescription').textContent=next?`${fmt(next.durationSec)} @ ${next.targetPower} W`:'—';$('rideCadenceTarget').textContent=s&&Number.isFinite(Number(s.cadenceLow))&&Number.isFinite(Number(s.cadenceHigh))?`Ziel ${s.cadenceLow}–${s.cadenceHigh}`:'Ziel —';renderMiniProfile();renderWorkoutChart($('rideWorkoutChart'),true);updateRideUi()
}
function renderMiniProfile(){const box=$('nextMiniProfile');box.innerHTML='';if(!state.workout)return;state.workout.steps.slice(Math.max(0,state.currentStep-1),state.currentStep+5).forEach((s,idx)=>{const i=document.createElement('i');i.style.height=`${Math.max(8,Math.min(34,8+s.targetPower/workoutPeak()*26))}px`;if(Math.max(0,state.currentStep-1)+idx===state.currentStep+1)i.classList.add('active');box.appendChild(i)})}
function updateLiveSensorText(){$('ridePower3s').textContent=Math.round(power3s()||0);$('rideHeartRate').textContent=Number.isFinite(state.latestHr)?Math.round(state.latestHr):'—';$('rideCadence').textContent=Number.isFinite(state.latestCadence)?Math.round(state.latestCadence):'—';$('rideSpeed').textContent=de1(state.virtualSpeedMs*3.6)}
function updateRideStats(){const ap=avgPower(),np=normalizedPower();$('rideAvgPower').textContent=Number.isFinite(ap)?Math.round(ap):'—';$('rideNp').textContent=Number.isFinite(np)?Math.round(np):'—';$('rideDistance').textContent=`${de1(state.virtualDistanceM/1000)} km`}
function updateRideUi(){
  updateLiveSensorText();updateRideStats();const s=currentStep(),rem=s?Math.max(0,s.durationSec-state.stepElapsedMs/1000):0;$('rideBlockRemaining').textContent=fmt(rem);if(s){const progress=Math.max(0,Math.min(1,state.stepElapsedMs/1000/s.durationSec));document.querySelector('.timer-ring').style.background=`conic-gradient(var(--cyan) 0 ${progress*100}%,#e7edf1 ${progress*100}% 100%)`}$('rideElapsed').textContent=fmt(state.activeElapsedMs/1000);$('ridePlanned').textContent=fmt(totalWorkoutSec());$('rideRemaining').textContent=fmt(remainingWorkoutSec());const now=performance.now();if(!updateRideUi._chartTs||now-updateRideUi._chartTs>=1000){renderWorkoutChart($('rideWorkoutChart'),true);updateRideUi._chartTs=now}
}

/* --------------------------------------------------------------------------
   Dashboard preview mode
   --------------------------------------------------------------------------
   This is deliberately separate from the real START button. It lets us review
   the Ride UI without weakening the production safety gate that requires a
   connected KICKR + ERG control. Preview mode never writes trainer commands,
   never creates history entries and never generates a FIT file.
*/
function startDashboardPreview(){
  if(!state.workout){toast('Zuerst ein Workout laden.');return}
  resetSession();
  state.previewMode=true;
  state.sessionActive=true;
  state.paused=true;
  state.currentStep=Math.min(1,state.workout.steps.length-1);
  const s=currentStep();
  state.stepElapsedMs=Math.max(0,Math.min(Number(s?.durationSec||0)*.42,Number(s?.durationSec||0)-1))*1000;
  let before=0;for(let i=0;i<state.currentStep;i++)before+=Number(state.workout.steps[i]?.durationSec||0);
  state.activeElapsedMs=(before+state.stepElapsedMs/1000)*1000;
  state.latestPower=Math.max(0,effectiveTarget()+2);
  state.latestCadence=92;
  state.latestHr=145;
  state.virtualSpeedMs=solveSteadySpeed(state.latestPower);
  state.virtualDistanceM=Math.max(0,state.virtualSpeedMs*(state.activeElapsedMs/1000)*.82);
  state.powerEvents=[{t:performance.now()-2000,p:state.latestPower-3},{t:performance.now()-1000,p:state.latestPower+1},{t:performance.now(),p:state.latestPower+2}];

  // Seed enough 1 Hz samples so average power, NP and the live chart look real.
  const sampleCount=Math.max(45,Math.min(180,Math.round(state.activeElapsedMs/1000)));
  state.samples=[];
  for(let i=0;i<sampleCount;i++){
    const wobble=Math.sin(i/5)*5+Math.sin(i/13)*3;
    const p=Math.max(0,state.latestPower+wobble);
    const activeSec=Math.max(0,state.activeElapsedMs/1000-sampleCount+i);
    const planSec=Math.max(0,plannedPositionSec()-sampleCount+i);
    state.samples.push({timestamp:new Date(Date.now()-(sampleCount-i)*1000),activeSec,planSec,power:p,cadence:91+Math.sin(i/7)*3,heartRate:143+Math.sin(i/11)*3,speed:state.virtualSpeedMs,distance:Math.max(0,state.virtualDistanceM-state.virtualSpeedMs*(sampleCount-i)),stepIndex:state.currentStep,targetPower:effectiveTarget()});
  }

  showScreen('ride');
  renderRideWorkout();
  updateRideUi();
  const badge=document.getElementById('previewBadge')||document.createElement('div');
  badge.id='previewBadge';badge.textContent='DASHBOARD-VORSCHAU · keine Trainersteuerung';
  badge.style.cssText='position:fixed;z-index:180;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);background:#10233a;color:#fff;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:.06em;box-shadow:0 6px 18px rgba(16,35,58,.18)';
  document.body.appendChild(badge);
  toast('Dashboard-Vorschau geöffnet');
  log('Dashboard-Vorschau ohne KICKR gestartet.');
}

const _finishWorkoutLive=finishWorkout;
finishWorkout=async function(reason='aborted'){
  if(state.previewMode){
    state.previewMode=false;state.sessionActive=false;state.paused=false;state.sessionEndWall=null;state.samples=[];state.powerEvents=[];state.latestPower=0;state.latestCadence=null;state.latestHr=null;state.latestRawSpeed=null;state.virtualSpeedMs=0;state.virtualDistanceM=0;
    document.getElementById('previewBadge')?.remove();
    showScreen('menu');renderMenuWorkout();updateChecklist();updateStartButton();toast('Dashboard-Vorschau beendet');log('Dashboard-Vorschau beendet.');return;
  }
  return _finishWorkoutLive(reason);
};

const _adjustTargetLive=adjustTarget;
adjustTarget=async function(delta){
  if(state.previewMode){state.effectiveOffset+=delta;state.latestPower=Math.max(0,effectiveTarget()+2);state.virtualSpeedMs=solveSteadySpeed(state.latestPower);renderRideWorkout();updateRideUi();toast(`Vorschau-Zielleistung ${effectiveTarget()} W`);return}
  return _adjustTargetLive(delta);
};

const _skipStepLive=skipStep;
skipStep=async function(){
  if(state.previewMode){
    if(state.currentStep<state.workout.steps.length-1)state.currentStep++;else state.currentStep=0;
    state.effectiveOffset=0;const s=currentStep();state.stepElapsedMs=Number(s?.durationSec||0)*.35*1000;state.latestPower=Math.max(0,effectiveTarget()+2);state.virtualSpeedMs=solveSteadySpeed(state.latestPower);renderRideWorkout();updateRideUi();toast('Vorschau: nächster Block');return;
  }
  return _skipStepLive();
};

const _togglePauseLive=togglePause;
togglePause=async function(){if(state.previewMode){toast('Pause/Fortsetzen ist in der statischen Vorschau deaktiviert.');return}return _togglePauseLive()};

(function installDashboardPreviewButton(){
  const host=document.querySelector('.secondary-actions');if(!host||document.getElementById('btnPreviewDashboard'))return;
  const b=document.createElement('button');b.id='btnPreviewDashboard';b.type='button';b.innerHTML='<svg class="ui-icon"><use href="#i-gauge"/></svg><span>Dashboard-Vorschau</span>';b.style.display='inline-flex';b.style.alignItems='center';b.style.gap='8px';b.onclick=startDashboardPreview;host.appendChild(b);
})();
