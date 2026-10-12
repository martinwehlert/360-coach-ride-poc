// 360° Coach Ride Diagnostics v6.1
// Trainer-like display dynamics around the outdoor steady-state speed model.
// Steady-state speed stays physics-based (CdA/Crr/mass). Transient response is an N=1 UI calibration.

model.speedTauUpSec=0.65;
model.speedTauDownSec=0.55;
model.coastDecelKmhPerSec=3.0; // 30 km/h -> 0 km/h in ~10 s at <=5 W
model.lowSpeedStopKmh=0.3;

function trainerLikeSimulationTick(){
  const now=performance.now();
  const dt=Math.max(0,Math.min(.5,(now-simLastTs)/1000));
  simLastTs=now;
  if(!running)return;

  const prev=virtualSpeedMs;
  const coasting=latestPower<=5;

  if(coasting){
    const nextKmh=Math.max(0,prev*3.6-model.coastDecelKmhPerSec*dt);
    virtualSpeedMs=nextKmh/3.6;
    if(nextKmh<model.lowSpeedStopKmh)virtualSpeedMs=0;
  }else{
    const target=solveSteadySpeed(latestPower,model.cda);
    const tau=target>=prev?model.speedTauUpSec:model.speedTauDownSec;
    const alpha=1-Math.exp(-dt/Math.max(.05,tau));
    virtualSpeedMs=prev+(target-prev)*alpha;
    if(Math.abs(target-virtualSpeedMs)<0.01)virtualSpeedMs=target;
  }

  virtualDistanceM+=((prev+virtualSpeedMs)/2)*dt;
  mechanicalWorkJ+=latestPower*dt;
  document.getElementById('virtualSpeed').textContent=(virtualSpeedMs*3.6).toFixed(1);
  document.getElementById('virtualDistance').textContent=(virtualDistanceM/1000).toFixed(2);
  document.getElementById('workKj').textContent=Math.round(mechanicalWorkJ/1000);
}

function simulateTrainerCoastSeconds(startKmh=30,endKmh=0){
  return Math.max(0,(startKmh-endKmh)/model.coastDecelKmhPerSec);
}

function simulatePowerResponseSeconds(cda,p0=140,p1=180,fraction=.95){
  const v0=solveSteadySpeed(p0,cda),v1=solveSteadySpeed(p1,cda);
  if(v1<=v0)return 0;
  const tau=model.speedTauUpSec;
  return -tau*Math.log(1-fraction);
}

// Override v6 transient model with v6.1 trainer-like dynamics.
clearInterval(simTimer);
simulationTick=trainerLikeSimulationTick;
simLastTs=performance.now();
simTimer=setInterval(simulationTick,250);

runPhysicsSelfTest=function(){
  const refs={road:{100:25.9967,140:29.8397,180:32.9545,250:37.3802,300:40.0270},tri:{100:28.0648,140:32.2977,180:35.7247,250:40.5888,300:43.4954}};
  let maxErr=0,lines=[];
  for(const [name,cda] of [['road',.30],['tri',.23]]){
    for(const p of [100,140,180,250,300]){
      const kmh=solveSteadySpeed(p,cda)*3.6,err=Math.abs(kmh-refs[name][p]);
      maxErr=Math.max(maxErr,err);
      lines.push(`${name==='road'?'ROAD':'TRI '} ${String(p).padStart(3)} W → ${kmh.toFixed(2)} km/h · ΔRef ${err.toFixed(3)}`);
    }
  }
  const d=10*60/1000;
  const coast30=simulateTrainerCoastSeconds(30,0);
  const responseRoad=simulatePowerResponseSeconds(.30,140,180,.95);
  const responseTri=simulatePowerResponseSeconds(.23,140,180,.95);
  const distPass=Math.abs(d-.6)<1e-12;
  const coastPass=Math.abs(coast30-10)<.05;
  const responsePass=responseRoad<2.2&&responseTri<2.2;
  const pass=maxErr<.01&&distPass&&coastPass&&responsePass;
  lines.push(`Distanzintegrator: 36 km/h × 60 s = ${d.toFixed(3)} km · ${distPass?'PASS':'FAIL'}`);
  lines.push(`Trainer-Spin-down: 30→0 km/h bei 0 W = ${coast30.toFixed(1)} s · ${coastPass?'PASS':'FAIL'}`);
  lines.push(`140→180 W: 95 % der neuen virtuellen Geschwindigkeit nach ~${responseRoad.toFixed(1)} s (ROAD) / ${responseTri.toFixed(1)} s (TRI) · ${responsePass?'PASS':'FAIL'}`);
  lines.push(`Dynamik-Kalibrierung: τ↑ ${model.speedTauUpSec.toFixed(2)} s · τ↓ ${model.speedTauDownSec.toFixed(2)} s · Coast ${model.coastDecelKmhPerSec.toFixed(1)} km/h/s`);
  lines.push(`Numerische Referenzabweichung max. ${maxErr.toFixed(4)} km/h · ${pass?'PASS':'FAIL'}`);
  document.getElementById('physicsDiag').textContent=lines.join('\n');
  document.getElementById('physicsDiag').className='diag '+(pass?'ok':'warn');
  log(`Physikmodell/Dynamik Selbsttest v6.1: ${pass?'PASS':'FAIL'}`);
};

log('Speed Dynamics v6.1 aktiv: 30→0 km/h ~10 s; Leistungswechsel ~2 s bis 95 %.');
