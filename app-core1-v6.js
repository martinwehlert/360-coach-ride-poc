const FTMS_SERVICE="00001826-0000-1000-8000-00805f9b34fb";
const FTMS_FEATURE="00002acc-0000-1000-8000-00805f9b34fb";
const INDOOR_BIKE_DATA="00002ad2-0000-1000-8000-00805f9b34fb";
const CONTROL_POINT="00002ad9-0000-1000-8000-00805f9b34fb";
const SUPPORTED_POWER_RANGE="00002ad8-0000-1000-8000-00805f9b34fb";
const HR_SERVICE="0000180d-0000-1000-8000-00805f9b34fb";
const HR_MEASUREMENT="00002a37-0000-1000-8000-00805f9b34fb";
const FIT_SDK_URL="https://cdn.jsdelivr.net/npm/@garmin/fitsdk@21.218.0/src/index.js";
const TREDICT_API="https://www.tredict.com/api/oauth/v2";

let device=null,server=null,ftms=null,bikeDataCharacteristic=null,controlPointCharacteristic=null;
let hrDevice=null,hrServer=null,hrCharacteristic=null;
let workout=null,currentStepIndex=-1,stepStartedAt=null,timerId=null,running=false;
let latestPower=0,latestCadence=null,latestRawSpeed=null,latestHeartRate=null;
let rawDistanceM=0,rawDistanceLastTs=null;

const model={riderKg:79,bikeKg:8,cda:0.23,crr:0.005,rho:1.225,grade:0,windKmh:0,coastDragMultiplier:1.40,lowSpeedStopKmh:4};
let virtualSpeedMs=0,virtualDistanceM=0,simLastTs=performance.now(),mechanicalWorkJ=0;
let simTimer=setInterval(simulationTick,250);

let sessionSamples=[],recordTimer=null,sessionStartedAt=null,sessionEndedAt=null,lastFitBytes=null,lastFitFilename=null;
let lastTredictCheck={checked:false,garminMatch:null};

function log(message){const box=document.getElementById('log');const time=new Date().toLocaleTimeString();box.textContent+=`[${time}] ${message}\n`;box.scrollTop=box.scrollHeight;}
function setStatus(text){document.getElementById('status').textContent=text;}
function fmt(sec){sec=Math.max(0,Math.round(sec));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function rawError(error){try{return JSON.stringify(error)}catch(e){return String(error)}}
function trainerReady(){return !!(device&&device.gatt&&device.gatt.connected&&controlPointCharacteristic);}
function uuidShort(uuid){const m=String(uuid).toLowerCase().match(/^0000([0-9a-f]{4})-/);return m?`0x${m[1].toUpperCase()}`:uuid;}
function bytesHex(view){const b=new Uint8Array(view.buffer,view.byteOffset,view.byteLength);return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(' ');}
function avg(arr){const a=arr.filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function maxVal(arr){const a=arr.filter(Number.isFinite);return a.length?Math.max(...a):null}
function safeName(s){return String(s||'ride').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'ride'}

function updateButtons(){
  document.getElementById('startBtn').disabled=!(trainerReady()&&workout&&!running);
  document.getElementById('skipBtn').disabled=!(trainerReady()&&workout&&running);
  document.getElementById('fitBuildBtn').disabled=sessionSamples.length<2||running;
  document.getElementById('fitDownloadBtn').disabled=!lastFitBytes;
  document.getElementById('fitShareBtn').disabled=!lastFitBytes;
  document.getElementById('tredictCheckBtn').disabled=!lastFitBytes||running;
  document.getElementById('tredictUploadBtn').disabled=!lastFitBytes||running||!lastTredictCheck.checked||!!lastTredictCheck.garminMatch;
  document.getElementById('roadBtn').disabled=running;
  document.getElementById('triBtn').disabled=running;
}

async function loadWorkout(path='workouts/current.json',sourceLabel='GitHub current.json'){
  if(running){log('Workout-Wechsel während laufender Session blockiert.');return;}
  try{
    const url=`${path}?ts=${Date.now()}`;log(`Lade Workout: ${url}`);
    const res=await fetch(url,{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);
    const data=await res.json();if(!Array.isArray(data.steps)||!data.steps.length)throw new Error('Keine gültigen steps.');
    workout=data;currentStepIndex=-1;document.getElementById('workoutName').textContent=`${workout.name} · ${workout.steps.length} Schritte · ${sourceLabel}`;renderStep();
    log(`Workout geladen: ${workout.name} | Quelle: ${sourceLabel}`);if(data.source?.type)log(`Workout Source Metadata: ${data.source.type}${data.source.id?' · '+data.source.id:''}`);updateButtons();
  }catch(e){workout=null;document.getElementById('workoutName').textContent='Workout konnte nicht geladen werden.';log(`WORKOUT FEHLER: ${e?.message||rawError(e)}`);updateButtons();}
}

async function connectTrainer(){
  try{
    log('Verbindungsversuch über FTMS-Servicefilter.');if(!navigator.bluetooth)throw new Error('Web Bluetooth nicht verfügbar.');
    device=await navigator.bluetooth.requestDevice({filters:[{services:[FTMS_SERVICE]}]});log(`Gerät ausgewählt: ${device.name||'Unbekannt'}`);device.addEventListener('gattserverdisconnected',onTrainerDisconnected);
    log('Verbinde KICKR GATT …');server=await device.gatt.connect();log('KICKR GATT verbunden.');ftms=await server.getPrimaryService(FTMS_SERVICE);log('FTMS Service gefunden.');
    await probeFTMSCapabilities();
    bikeDataCharacteristic=await ftms.getCharacteristic(INDOOR_BIKE_DATA);await bikeDataCharacteristic.startNotifications();bikeDataCharacteristic.addEventListener('characteristicvaluechanged',handleBikeData);log('Indoor Bike Data Notifications aktiv.');
    controlPointCharacteristic=await ftms.getCharacteristic(CONTROL_POINT);await controlPointCharacteristic.startNotifications();controlPointCharacteristic.addEventListener('characteristicvaluechanged',handleControlResponse);log('Control Point Notifications aktiv.');
    try{const rangeChar=await ftms.getCharacteristic(SUPPORTED_POWER_RANGE);const range=await rangeChar.readValue();if(range.byteLength>=6)log(`Supported Power Range: ${range.getInt16(0,true)}–${range.getInt16(2,true)} W | Schritt ${range.getUint16(4,true)} W`);}catch(e){log('Power Range Hinweis: '+(e?.message||rawError(e)));}
    setStatus(`Verbunden: ${device.name||'KICKR'}`);log('Trainer vollständig verbunden.');await requestControl();updateButtons();
  }catch(error){setStatus('KICKR Fehler');log('KICKR FEHLER: '+(error?.message||String(error)));updateButtons();}
}

async function probeFTMSCapabilities(){
  const lines=[];
  try{const chars=await ftms.getCharacteristics();const list=chars.map(c=>uuidShort(c.uuid)).join(', ');log('FTMS Characteristics: '+list);lines.push('Characteristics: '+list);}catch(e){lines.push('Characteristics nicht lesbar.');}
  try{
    const fc=await ftms.getCharacteristic(FTMS_FEATURE),v=await fc.readValue();log('Fitness Machine Feature RAW: '+bytesHex(v));
    if(v.byteLength>=8){const machine=v.getUint32(0,true),target=v.getUint32(4,true);const machineNames=['Ø Speed','Cadence','Total Distance','Inclination','Elevation Gain','Pace','Step Count','Resistance','Stride Count','Energy','Heart Rate','MET','Elapsed Time','Remaining Time','Power'];const targetNames=['Speed Target','Inclination Target','Resistance Target','Power Target','HR Target','Energy Target','Step Target','Stride Target','Distance Target','Training Time','Time in 2 HR Zones','Time in 3 HR Zones','Time in 5 HR Zones','Indoor Bike Simulation','Wheel Circumference','Spin Down','Cadence Target'];const m=[],t=[];for(let i=0;i<machineNames.length;i++)if(machine&(1<<i))m.push(machineNames[i]);for(let i=0;i<targetNames.length;i++)if(target&(1<<i))t.push(targetNames[i]);log('FTMS Machine Features: '+(m.join(', ')||'—'));log('FTMS Target Features: '+(t.join(', ')||'—'));lines.push(`Feature RAW: ${bytesHex(v)}\nMachine: ${m.join(', ')||'—'}\nTargets: ${t.join(', ')||'—'}`);}
  }catch(e){lines.push('Fitness Machine Feature nicht lesbar.');}
  document.getElementById('capabilities').textContent=lines.join('\n');
}

async function connectHRM(){
  try{
    if(!navigator.bluetooth)throw new Error('Web Bluetooth nicht verfügbar.');log('Suche BLE Heart Rate Sensor …');
    hrDevice=await navigator.bluetooth.requestDevice({filters:[{services:[HR_SERVICE]}]});log(`HR-Gerät ausgewählt: ${hrDevice.name||'Unbekannt'}`);hrDevice.addEventListener('gattserverdisconnected',onHRDisconnected);
    hrServer=await hrDevice.gatt.connect();const svc=await hrServer.getPrimaryService(HR_SERVICE);hrCharacteristic=await svc.getCharacteristic(HR_MEASUREMENT);await hrCharacteristic.startNotifications();hrCharacteristic.addEventListener('characteristicvaluechanged',handleHeartRate);
    document.getElementById('hrStatus').textContent=`HRM: ${hrDevice.name||'verbunden'}`;log('Heart Rate Notifications aktiv.');
  }catch(e){document.getElementById('hrStatus').textContent='HRM: Fehler';log('HRM FEHLER: '+(e?.message||String(e)));}
}

function handleHeartRate(event){const v=event.target.value,flags=v.getUint8(0);latestHeartRate=(flags&1)?v.getUint16(1,true):v.getUint8(1);document.getElementById('heartRate').textContent=latestHeartRate;}
function onHRDisconnected(){document.getElementById('hrStatus').textContent='HRM: getrennt';latestHeartRate=null;document.getElementById('heartRate').textContent='--';log('HRM getrennt.');}
function disconnectHRM(){if(hrDevice?.gatt?.connected)hrDevice.gatt.disconnect();onHRDisconnected();}

function handleBikeData(event){
  try{
    const v=event.target.value;let i=0;if(v.byteLength<2)return;const flags=v.getUint16(i,true);i+=2;let speed=null,cadence=null,power=null;
    if((flags&0x0001)===0&&i+2<=v.byteLength){speed=v.getUint16(i,true)/100;i+=2;}if(flags&0x0002)i+=2;
    if(flags&0x0004&&i+2<=v.byteLength){cadence=v.getUint16(i,true)/2;i+=2;}if(flags&0x0008)i+=2;if(flags&0x0010)i+=3;if(flags&0x0020)i+=2;
    if(flags&0x0040&&i+2<=v.byteLength){power=v.getInt16(i,true);i+=2;}
    if(speed!==null){latestRawSpeed=speed;document.getElementById('rawSpeed').textContent=speed.toFixed(1);const now=performance.now();if(rawDistanceLastTs!==null)rawDistanceM+=(speed/3.6)*Math.max(0,Math.min(2,(now-rawDistanceLastTs)/1000));rawDistanceLastTs=now;}
    if(cadence!==null){latestCadence=cadence;document.getElementById('cadence').textContent=Math.round(cadence);}
    if(power!==null){latestPower=Math.max(0,power);document.getElementById('power').textContent=power;}
  }catch(e){log('DATA PARSE ERROR: '+(e?.message||rawError(e)));}
}

async function requestControl(){if(!controlPointCharacteristic)return;log('Sende FTMS Request Control …');await writeControl(new Uint8Array([0x00]));}
async function setTargetPower(watts){if(!controlPointCharacteristic)throw new Error('Control Point nicht verbunden.');const b=new ArrayBuffer(3),v=new DataView(b);v.setUint8(0,0x05);v.setInt16(1,watts,true);log(`Sende Target Power: ${watts} W`);await writeControl(new Uint8Array(b));}
async function writeControl(data){if(typeof controlPointCharacteristic.writeValueWithResponse==='function')await controlPointCharacteristic.writeValueWithResponse(data);else await controlPointCharacteristic.writeValue(data);}
function handleControlResponse(event){const v=event.target.value,bytes=new Uint8Array(v.buffer,v.byteOffset,v.byteLength),hex=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join(' ');log('Control Response: '+hex);if(bytes.length>=3&&bytes[0]===0x80){const map={1:'SUCCESS',2:'OPCODE NOT SUPPORTED',3:'INVALID PARAMETER',4:'OPERATION FAILED',5:'CONTROL NOT PERMITTED'};log(`FTMS Opcode 0x${bytes[1].toString(16).padStart(2,'0')} → ${map[bytes[2]]||bytes[2]}`);}}
