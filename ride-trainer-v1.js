async function connectTrainer(){
  try{
    if(state.trainerConnected){toast('KICKR ist bereits verbunden.');return}
    if(!navigator.bluetooth)throw new Error('Web Bluetooth nicht verfügbar');
    const d=await navigator.bluetooth.requestDevice({filters:[{services:[FTMS_SERVICE]}]});state.trainerDevice=d;d.addEventListener('gattserverdisconnected',onTrainerDisconnected);
    state.trainerServer=await d.gatt.connect();state.ftms=await state.trainerServer.getPrimaryService(FTMS_SERVICE);
    state.bikeChar=await state.ftms.getCharacteristic(INDOOR_BIKE_DATA);await state.bikeChar.startNotifications();state.bikeChar.addEventListener('characteristicvaluechanged',handleBikeData);
    state.controlChar=await state.ftms.getCharacteristic(CONTROL_POINT);try{await state.controlChar.startNotifications();state.controlChar.addEventListener('characteristicvaluechanged',handleControlResponse)}catch{}
    state.trainerConnected=true;await requestControl();state.ergReady=true;log(`KICKR verbunden: ${d.name||'Trainer'}`);toast('KICKR verbunden');updateConnectionUi();
  }catch(e){state.trainerConnected=false;state.ergReady=false;updateConnectionUi();toast('KICKR Verbindung fehlgeschlagen');log('KICKR FEHLER: '+e.message)}
}
function onTrainerDisconnected(){state.trainerConnected=false;state.ergReady=false;state.latestPower=0;updateConnectionUi();log('KICKR getrennt.');if(state.sessionActive&&!state.paused)toast('KICKR-Verbindung verloren')}
async function connectHRM(){
  try{
    if(state.hrConnected){toast('HRM-Pro ist bereits verbunden.');return}
    if(!navigator.bluetooth)throw new Error('Web Bluetooth nicht verfügbar');
    const d=await navigator.bluetooth.requestDevice({filters:[{services:[HR_SERVICE]}]});state.hrDevice=d;d.addEventListener('gattserverdisconnected',onHrDisconnected);state.hrServer=await d.gatt.connect();const svc=await state.hrServer.getPrimaryService(HR_SERVICE);state.hrChar=await svc.getCharacteristic(HR_MEASUREMENT);await state.hrChar.startNotifications();state.hrChar.addEventListener('characteristicvaluechanged',handleHeartRate);state.hrConnected=true;log(`HRM verbunden: ${d.name||'HRM'}`);toast('HRM-Pro verbunden');updateConnectionUi();
  }catch(e){state.hrConnected=false;updateConnectionUi();toast('HRM Verbindung fehlgeschlagen');log('HRM FEHLER: '+e.message)}
}
function onHrDisconnected(){state.hrConnected=false;state.latestHr=null;updateConnectionUi();log('HRM getrennt.')}
function handleHeartRate(e){const v=e.target.value,flags=v.getUint8(0);state.latestHr=(flags&1)?v.getUint16(1,true):v.getUint8(1);updateLiveSensorText()}
function handleBikeData(e){
  try{const v=e.target.value;let i=0;if(v.byteLength<2)return;const flags=v.getUint16(i,true);i+=2;let speed=null,cad=null,power=null;if((flags&1)===0&&i+2<=v.byteLength){speed=v.getUint16(i,true)/100;i+=2}if(flags&2)i+=2;if(flags&4&&i+2<=v.byteLength){cad=v.getUint16(i,true)/2;i+=2}if(flags&8)i+=2;if(flags&16)i+=3;if(flags&32)i+=2;if(flags&64&&i+2<=v.byteLength){power=v.getInt16(i,true);i+=2}
    if(Number.isFinite(speed))state.latestRawSpeed=speed;if(Number.isFinite(cad))state.latestCadence=cad;if(Number.isFinite(power)){state.latestPower=Math.max(0,power);const now=performance.now();state.powerEvents.push({t:now,p:state.latestPower});state.powerEvents=state.powerEvents.filter(x=>now-x.t<=5000)}updateLiveSensorText();
  }catch(err){log('FTMS parse error: '+err.message)}
}
function handleControlResponse(e){const v=e.target.value,b=new Uint8Array(v.buffer,v.byteOffset,v.byteLength);if(b.length>=3&&b[0]===0x80)log(`FTMS response opcode ${b[1]} result ${b[2]}`)}
async function writeControl(data){if(!state.controlChar)throw new Error('Control Point fehlt');if(typeof state.controlChar.writeValueWithResponse==='function')await state.controlChar.writeValueWithResponse(data);else await state.controlChar.writeValue(data)}
async function requestControl(){await writeControl(new Uint8Array([0x00]))}
async function setTargetPower(w){const b=new ArrayBuffer(3),v=new DataView(b);v.setUint8(0,0x05);v.setInt16(1,Math.round(w),true);await writeControl(new Uint8Array(b));log(`Target Power ${Math.round(w)} W`)}

function selectedCda(){return state.bike==='road'?state.roadCda:state.triCda}
function powerRequired(v){const m=state.riderKg+state.bikeKg,g=9.80665;return .5*state.rho*selectedCda()*v*v*v+state.crr*m*g*v}
function solveSteadySpeed(power){if(power<=0)return 0;let lo=0,hi=40;for(let n=0;n<70;n++){const mid=(lo+hi)/2;if(powerRequired(mid)<power)lo=mid;else hi=mid}return(lo+hi)/2}
function simulationTick(){
  const now=performance.now(),dt=Math.max(0,Math.min(.5,(now-state.simLastTs)/1000));state.simLastTs=now;if(!state.sessionActive)return;const prev=state.virtualSpeedMs;
  if(state.latestPower<=5){state.virtualSpeedMs=Math.max(0,(prev*3.6-state.coastDecelKmhPerSec*dt)/3.6)}else{const target=solveSteadySpeed(state.latestPower);const tau=target>=prev?state.speedTauUp:state.speedTauDown;const alpha=1-Math.exp(-dt/Math.max(.05,tau));state.virtualSpeedMs=prev+(target-prev)*alpha}
  if(!state.paused)state.virtualDistanceM+=((prev+state.virtualSpeedMs)/2)*dt;updateLiveSensorText();
}
setInterval(simulationTick,250);
function power3s(){const now=performance.now(),v=state.powerEvents.filter(x=>now-x.t<=3000).map(x=>x.p);return v.length?avg(v):state.latestPower}
function avgPower(){return avg(state.samples.map(s=>s.power))}
function normalizedPower(){const p=state.samples.map(s=>s.power).filter(Number.isFinite);if(p.length<30)return null;const fourth=[];for(let i=29;i<p.length;i++){const a=p.slice(i-29,i+1).reduce((s,x)=>s+x,0)/30;fourth.push(a**4)}return (fourth.reduce((s,x)=>s+x,0)/fourth.length)**.25}