function powerRequired(v,cda=model.cda){const m=model.riderKg+model.bikeKg,g=9.80665,grade=Math.atan(model.grade),wind=model.windKmh/3.6,airV=Math.max(0,v+wind);return .5*model.rho*cda*airV*airV*v+model.crr*m*g*Math.cos(grade)*v+m*g*Math.sin(grade)*v;}
function solveSteadySpeed(power,cda=model.cda){if(power<=0)return 0;let lo=0,hi=40;for(let n=0;n<80;n++){const mid=(lo+hi)/2;if(powerRequired(mid,cda)<power)lo=mid;else hi=mid;}return (lo+hi)/2;}
function simulationTick(){
  const now=performance.now(),dt=Math.max(0,Math.min(.5,(now-simLastTs)/1000));simLastTs=now;if(!running)return;
  const m=model.riderKg+model.bikeKg,g=9.80665,v=virtualSpeedMs,wind=model.windKmh/3.6,rel=Math.max(0,v+wind);
  let aero=.5*model.rho*model.cda*rel*rel,roll=model.crr*m*g,gradeF=m*g*Math.sin(Math.atan(model.grade));
  const coasting=latestPower<=5;
  if(coasting){aero*=model.coastDragMultiplier;roll*=model.coastDragMultiplier;}
  const drive=latestPower/Math.max(v,2.5);let a=(drive-aero-roll-gradeF)/m;a=Math.max(-3,Math.min(1.5,a));
  virtualSpeedMs=Math.max(0,v+a*dt);
  if(coasting&&virtualSpeedMs*3.6<model.lowSpeedStopKmh)virtualSpeedMs=0;
  virtualDistanceM+=virtualSpeedMs*dt;mechanicalWorkJ+=latestPower*dt;
  document.getElementById('virtualSpeed').textContent=(virtualSpeedMs*3.6).toFixed(1);document.getElementById('virtualDistance').textContent=(virtualDistanceM/1000).toFixed(2);document.getElementById('workKj').textContent=Math.round(mechanicalWorkJ/1000);
}
function resetVirtualModel(){if(running){log('Reset während laufender Session blockiert.');return;}virtualSpeedMs=0;virtualDistanceM=0;mechanicalWorkJ=0;document.getElementById('virtualSpeed').textContent='0.0';document.getElementById('virtualDistance').textContent='0.00';document.getElementById('workKj').textContent='0';log('Virtuelles Speed-/Distanzmodell zurückgesetzt.');}
function setBikeProfile(type){if(running){log('Bike-Profilwechsel während laufender Session blockiert.');return;}model.cda=type==='road'?.30:.23;document.getElementById('roadBtn').classList.toggle('active',type==='road');document.getElementById('triBtn').classList.toggle('active',type==='tri');log(`Virtuelles Bike-Profil: ${type==='road'?'RENNRAD':'TRI'} · CdA ${model.cda.toFixed(2)}`);}
function simulateCoastSeconds(cda,startKmh=35,endKmh=20){
  const m=model.riderKg+model.bikeKg,g=9.80665,dt=.01;let v=startKmh/3.6,t=0;
  while(v>endKmh/3.6&&t<300){const aero=.5*model.rho*cda*v*v*model.coastDragMultiplier,roll=model.crr*m*g*model.coastDragMultiplier;v=Math.max(0,v-(aero+roll)/m*dt);t+=dt;}
  return t;
}
function runPhysicsSelfTest(){
  const refs={road:{100:25.9967,140:29.8397,180:32.9545,250:37.3802,300:40.0270},tri:{100:28.0648,140:32.2977,180:35.7247,250:40.5888,300:43.4954}};let maxErr=0,lines=[];
  for(const [name,cda] of [['road',.30],['tri',.23]]){for(const p of [100,140,180,250,300]){const kmh=solveSteadySpeed(p,cda)*3.6,err=Math.abs(kmh-refs[name][p]);maxErr=Math.max(maxErr,err);lines.push(`${name==='road'?'ROAD':'TRI '} ${String(p).padStart(3)} W → ${kmh.toFixed(2)} km/h · ΔRef ${err.toFixed(3)}`);}}
  const d=10*60/1000,roadCoast=simulateCoastSeconds(.30),triCoast=simulateCoastSeconds(.23);const distPass=Math.abs(d-.6)<1e-12,pass=maxErr<.01&&distPass;
  lines.push(`Distanzintegrator: 36 km/h × 60 s = ${d.toFixed(3)} km · ${distPass?'PASS':'FAIL'}`);
  lines.push(`Freewheel-Test 35→20 km/h: ROAD ${roadCoast.toFixed(1)} s · TRI ${triCoast.toFixed(1)} s`);
  lines.push(`Coast-Kalibrierung: Crr ${model.crr.toFixed(3)} · Drag ×${model.coastDragMultiplier.toFixed(2)} bei ≤5 W · Stop <${model.lowSpeedStopKmh} km/h`);
  lines.push(`Numerische Referenzabweichung max. ${maxErr.toFixed(4)} km/h · ${pass?'PASS':'FAIL'}`);document.getElementById('physicsDiag').textContent=lines.join('\n');document.getElementById('physicsDiag').className='diag '+(pass?'ok':'warn');log(`Physikmodell Selbsttest: ${pass?'PASS':'FAIL'}`);
}

async function startWorkout(){
  if(!trainerReady()||!workout)return;
  try{
    await requestControl();resetSessionRecording();resetVirtualModel();sessionStartedAt=new Date();running=true;currentStepIndex=0;startRecording();log('Workout gestartet. Bike-Profil für Session gesperrt.');await beginCurrentStep();updateButtons();
  }catch(e){running=false;stopRecording();log('START FEHLER: '+(e?.message||rawError(e)));updateButtons();}
}
function resetSessionRecording(){sessionSamples=[];sessionStartedAt=null;sessionEndedAt=null;lastFitBytes=null;lastFitFilename=null;lastTredictCheck={checked:false,garminMatch:null};document.getElementById('fitStatus').textContent='FIT: Aufnahme bereit';document.getElementById('fitDiag').textContent='Session-Aufzeichnung bereit.';document.getElementById('tredictDiag').textContent='Noch nicht geprüft.';updateButtons();}
function startRecording(){captureSample();clearInterval(recordTimer);recordTimer=setInterval(captureSample,1000);}
function stopRecording(){clearInterval(recordTimer);recordTimer=null;}
function captureSample(){if(!running||!sessionStartedAt)return;sessionSamples.push({timestamp:new Date(),power:Number.isFinite(latestPower)?latestPower:null,cadence:Number.isFinite(latestCadence)?latestCadence:null,heartRate:Number.isFinite(latestHeartRate)?latestHeartRate:null,speed:virtualSpeedMs,distance:virtualDistanceM,targetPower:(workout&&currentStepIndex>=0&&workout.steps[currentStepIndex])?workout.steps[currentStepIndex].targetPower:null,stepIndex:currentStepIndex});document.getElementById('fitStatus').textContent=`FIT: ${sessionSamples.length} Samples`}
async function beginCurrentStep(){if(!workout||currentStepIndex<0||currentStepIndex>=workout.steps.length){await finishWorkout();return;}const step=workout.steps[currentStepIndex];stepStartedAt=Date.now();log(`Schritt ${currentStepIndex+1}/${workout.steps.length}: ${step.name} · ${step.durationSec}s · ${step.targetPower}W`);await setTargetPower(step.targetPower);renderStep();clearInterval(timerId);timerId=setInterval(tick,250);}
function tick(){if(!running||!workout||currentStepIndex<0)return;const step=workout.steps[currentStepIndex],elapsed=(Date.now()-stepStartedAt)/1000;document.getElementById('timerPill').textContent=`${fmt(elapsed)} / ${fmt(step.durationSec)}`;if(elapsed>=step.durationSec)advanceStep('AUTO');}
async function advanceStep(reason){if(!running)return;clearInterval(timerId);log(`${reason}: Schritt ${currentStepIndex+1} beendet.`);currentStepIndex++;if(currentStepIndex>=workout.steps.length)await finishWorkout();else await beginCurrentStep();}
async function skipStep(){if(!running)return;log(`SKIP gedrückt bei Schritt ${currentStepIndex+1}.`);await advanceStep('SKIP');}
async function finishWorkout(){clearInterval(timerId);captureSample();running=false;stopRecording();sessionEndedAt=new Date();currentStepIndex=workout?workout.steps.length:-1;stepStartedAt=null;log(`Workout beendet. Samples: ${sessionSamples.length}. Virtuell: ${(virtualDistanceM/1000).toFixed(2)} km · ${Math.round(mechanicalWorkJ/1000)} kJ.`);try{await setTargetPower(100);}catch(e){log('Cooldown-Hinweis: '+(e?.message||rawError(e)));}renderStep();document.getElementById('fitStatus').textContent=`FIT: ${sessionSamples.length} Samples bereit`;updateButtons();}
function renderStep(){
  if(!workout){document.getElementById('stepName').textContent='–';return;}
  if(currentStepIndex>=0&&currentStepIndex<workout.steps.length){const s=workout.steps[currentStepIndex];document.getElementById('stepName').textContent=s.name;document.getElementById('targetPill').textContent=`Ziel ${s.targetPower} W`;document.getElementById('timerPill').textContent=`0:00 / ${fmt(s.durationSec)}`;document.getElementById('stepPill').textContent=`Schritt ${currentStepIndex+1} / ${workout.steps.length}`;const n=workout.steps[currentStepIndex+1];document.getElementById('nextStep').textContent=n?`${n.name} · ${n.durationSec}s @ ${n.targetPower} W`:'Workout-Ende';}
  else if(currentStepIndex>=workout.steps.length){document.getElementById('stepName').textContent='Fertig';document.getElementById('targetPill').textContent='Cooldown 100 W';document.getElementById('timerPill').textContent='–';document.getElementById('stepPill').textContent=`${workout.steps.length} / ${workout.steps.length}`;document.getElementById('nextStep').textContent='–';}
  else{document.getElementById('stepName').textContent='Bereit';document.getElementById('targetPill').textContent='Ziel -- W';document.getElementById('timerPill').textContent='0:00 / 0:00';document.getElementById('stepPill').textContent=`0 / ${workout.steps.length}`;const n=workout.steps[0];document.getElementById('nextStep').textContent=n?`${n.name} · ${n.durationSec}s @ ${n.targetPower} W`:'–';}
}

async function buildAndValidateFit(){
  if(sessionSamples.length<2||!sessionStartedAt){log('FIT: zu wenige Samples.');return;}
  const box=document.getElementById('fitDiag');box.textContent='Lade offizielles Garmin FIT SDK …';
  try{
    const {Encoder,Decoder,Stream,Profile}=await import(FIT_SDK_URL);log('Garmin FIT SDK geladen.');
    const encoder=new Encoder(),start=sessionStartedAt,end=sessionEndedAt||sessionSamples.at(-1).timestamp,duration=Math.max(1,(end-start)/1000);
    encoder.writeMesg({mesgNum:Profile.MesgNum.FILE_ID,manufacturer:'development',product:1,serialNumber:360001,timeCreated:start,type:'activity'});
    encoder.writeMesg({mesgNum:Profile.MesgNum.EVENT,timestamp:start,event:'timer',eventType:'start'});
    for(const s of sessionSamples){const rec={mesgNum:Profile.MesgNum.RECORD,timestamp:s.timestamp,distance:s.distance,speed:s.speed,enhancedSpeed:s.speed};if(Number.isFinite(s.power))rec.power=Math.round(s.power);if(Number.isFinite(s.cadence))rec.cadence=Math.round(s.cadence);if(Number.isFinite(s.heartRate))rec.heartRate=Math.round(s.heartRate);encoder.writeMesg(rec);}
    encoder.writeMesg({mesgNum:Profile.MesgNum.EVENT,timestamp:end,event:'timer',eventType:'stopAll'});
    const p=sessionSamples.map(x=>x.power),h=sessionSamples.map(x=>x.heartRate),c=sessionSamples.map(x=>x.cadence),sp=sessionSamples.map(x=>x.speed);
    const common={timestamp:end,startTime:start,totalElapsedTime:duration,totalTimerTime:duration,totalDistance:virtualDistanceM,sport:'cycling',subSport:'indoorCycling',avgSpeed:avg(sp),maxSpeed:maxVal(sp),avgPower:avg(p),maxPower:maxVal(p),avgCadence:avg(c),maxCadence:maxVal(c),avgHeartRate:avg(h),maxHeartRate:maxVal(h),totalWork:Math.round(mechanicalWorkJ)};
    encoder.writeMesg({mesgNum:Profile.MesgNum.LAP,messageIndex:0,...common});
    encoder.writeMesg({mesgNum:Profile.MesgNum.SESSION,messageIndex:0,...common,firstLapIndex:0,numLaps:1});
    encoder.writeMesg({mesgNum:Profile.MesgNum.ACTIVITY,timestamp:end,totalTimerTime:duration,numSessions:1});
    const bytes=encoder.close();
    const stream=Stream.fromByteArray(Array.from(bytes)),decoder=new Decoder(stream),isFit=decoder.isFIT(),integrity=decoder.checkIntegrity();const decoded=decoder.read({convertTypesToStrings:true,convertDateTimesToDates:true});
    const recCount=decoded?.messages?.recordMesgs?.length ?? decoded?.messages?.record?.length ?? sessionSamples.length;
    lastFitBytes=bytes;lastFitFilename=`${start.toISOString().slice(0,10)}-${safeName(workout?.name)}.fit`;
    box.textContent=`FIT erzeugt: ${bytes.length} Bytes\nisFIT: ${isFit}\nIntegrity: ${integrity}\nSamples geschrieben: ${sessionSamples.length}\nDecoded Records: ${recCount}\nDatei: ${lastFitFilename}`;box.className='diag '+(isFit&&integrity?'ok':'warn');document.getElementById('fitStatus').textContent=`FIT: ${isFit&&integrity?'VALID ✅':'prüfen ⚠️'}`;log(`FIT Export: isFIT=${isFit} integrity=${integrity} bytes=${bytes.length}`);updateButtons();
  }catch(e){lastFitBytes=null;box.textContent=`FIT FEHLER: ${e?.message||String(e)}\n${rawError(e)}`;box.className='diag warn';document.getElementById('fitStatus').textContent='FIT: Fehler';log('FIT FEHLER: '+(e?.message||String(e)));updateButtons();}
}
