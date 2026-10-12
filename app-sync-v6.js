async function shareLastFit(){
  if(!lastFitBytes)return;
  const file=new File([lastFitBytes],lastFitFilename||'360-coach-ride.fit',{type:'application/octet-stream'});
  try{
    if(!navigator.share||!navigator.canShare||!navigator.canShare({files:[file]})){log('FIT Teilen: File Share wird von diesem Browser nicht unterstützt.');return;}
    await navigator.share({files:[file],title:'360° Coach Ride FIT'});
    log('FIT Share Sheet erfolgreich geöffnet/abgeschlossen: '+file.name);
  }catch(e){if(e?.name==='AbortError')log('FIT Teilen vom Nutzer abgebrochen.');else log('FIT Teilen FEHLER: '+(e?.message||String(e)));}
}
function downloadLastFit(){if(!lastFitBytes)return;const blob=new Blob([lastFitBytes],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=lastFitFilename||'360-coach-ride.fit';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);log('FIT Download angefordert: '+a.download+' (Browser-Speicherung nicht garantiert)');}

function getTredictToken(){return document.getElementById('tredictToken').value.trim();}
async function tredictRequest(path,options={}){
  const token=getTredictToken();if(!token)throw new Error('Kein Tredict Token eingegeben.');
  const headers=new Headers(options.headers||{});headers.set('Authorization','Bearer '+token);if(!headers.has('Accept'))headers.set('Accept','application/json;charset=UTF-8');
  const res=await fetch(TREDICT_API+path,{...options,headers});let body=null;const txt=await res.text();try{body=txt?JSON.parse(txt):null}catch(_){body=txt}
  if(!res.ok)throw new Error(`Tredict HTTP ${res.status}: ${typeof body==='string'?body:JSON.stringify(body)}`);
  return body;
}
async function testTredictConnection(){
  const box=document.getElementById('tredictDiag');box.textContent='Prüfe Tredict API …';
  try{const data=await tredictRequest('/activityList?pageSize=50');const list=data?._embedded?.activityList||[];box.textContent=`Tredict API erreichbar. ${list.length} letzte Aktivitäten lesbar. Token wurde nicht gespeichert.`;box.className='diag ok';log(`Tredict Verbindung OK. Aktivitätsliste: ${list.length} Einträge.`);}
  catch(e){box.textContent='Tredict Verbindung FEHLER: '+(e?.message||String(e));box.className='diag warn';log('Tredict Verbindung FEHLER: '+(e?.message||String(e)));}
}
async function findGarminMatch(){
  if(!sessionStartedAt||!sessionEndedAt)throw new Error('Keine abgeschlossene Session zum Abgleich.');
  const ownDuration=(sessionEndedAt-sessionStartedAt)/1000,ownPower=avg(sessionSamples.map(x=>x.power));
  const data=await tredictRequest('/activityList?pageSize=50');const list=data?._embedded?.activityList||[];
  const candidates=list.filter(x=>x.sportType==='cycling'&&x.isFromGarminApi&&Math.abs(new Date(x.date)-sessionStartedAt)<=10*60*1000).sort((a,b)=>Math.abs(new Date(a.date)-sessionStartedAt)-Math.abs(new Date(b.date)-sessionStartedAt));
  for(const c of candidates.slice(0,5)){
    try{
      const d=await tredictRequest('/activity/'+encodeURIComponent(c.id));const dur=d?.summary?.duration??d?.summary?.durationTotal;const pow=d?.summary?.power;
      const timeDelta=Math.abs(new Date(c.date)-sessionStartedAt)/1000,durDiff=Number.isFinite(dur)?Math.abs(dur-ownDuration):null,powDiff=(Number.isFinite(pow)&&Number.isFinite(ownPower))?Math.abs(pow-ownPower):null;
      const timeOk=timeDelta<=300,durOk=durDiff===null||durDiff<=Math.max(45,ownDuration*.25),powOk=powDiff===null||powDiff<=Math.max(20,ownPower*.15);
      if(timeOk&&durOk&&powOk)return {id:c.id,date:c.date,attribution:c.attribution||'Garmin',timeDelta,duration:dur,durDiff,power:pow,powDiff};
    }catch(e){log('Tredict Kandidat konnte nicht detailliert geprüft werden: '+c.id);}
  }
  return null;
}
async function checkTredictForGarminMatch(){
  const box=document.getElementById('tredictDiag');box.textContent='Suche passende Garmin-Aktivität in Tredict …';lastTredictCheck={checked:false,garminMatch:null};updateButtons();
  try{
    const match=await findGarminMatch();lastTredictCheck={checked:true,garminMatch:match};
    if(match){box.textContent=`Garmin-Aktivität gefunden ✅\nID: ${match.id}\nQuelle: ${match.attribution}\nStartabweichung: ${match.timeDelta.toFixed(0)} s${Number.isFinite(match.durDiff)?`\\nDauerabweichung: ${match.durDiff.toFixed(0)} s`:''}${Number.isFinite(match.powDiff)?`\\nØ-Power-Abweichung: ${match.powDiff.toFixed(0)} W`:''}\n\nKein 360°-FIT Upload nötig.`;box.className='diag ok';log('Tredict Sync Guard: passende Garmin-Aktivität gefunden. FIT Upload übersprungen.');}
    else{box.textContent='Keine passende Garmin-Aktivität gefunden. FIT-Fallback ist jetzt freigegeben. Vor dem Upload kurz sicherstellen, dass Garmin bereits synchronisieren konnte.';box.className='diag warn';log('Tredict Sync Guard: kein Garmin-Match. FIT-Fallback freigegeben.');}
  }catch(e){box.textContent='Tredict Prüfung FEHLER: '+(e?.message||String(e));box.className='diag warn';log('Tredict Prüfung FEHLER: '+(e?.message||String(e)));}
  updateButtons();
}
async function uploadFitToTredict(){
  if(!lastFitBytes)throw new Error('Kein FIT vorhanden.');
  if(!lastTredictCheck.checked||lastTredictCheck.garminMatch){log('Tredict Upload blockiert: zuerst Duplikatprüfung durchführen.');return;}
  const box=document.getElementById('tredictDiag');box.textContent='Lade 360°-FIT als Fallback zu Tredict …';
  try{
    const fd=new FormData();const file=new File([lastFitBytes],lastFitFilename||'360-coach-ride.fit',{type:'application/octet-stream'});fd.append('file',file,file.name);fd.append('name',workout?.name||'360° Coach Ride');fd.append('notes',`360° Coach Ride Player · virtuelle Distanz ${(virtualDistanceM/1000).toFixed(2)} km · ${sessionSamples.length} Samples`);
    const result=await tredictRequest('/activity/upload',{method:'POST',body:fd});
    if(result?.error==='FILE_EXISTS'){const id=result?.meta?.[0]?.trainingId||'bekannt';box.textContent=`Tredict meldet FILE_EXISTS ✅\nDuplikat bereits vorhanden. Training-ID: ${id}`;box.className='diag ok';log('Tredict Upload: FILE_EXISTS – Duplikat erkannt.');}
    else if(result?.success?.length){const id=result.success[0].trainingId;box.textContent=`FIT erfolgreich zu Tredict hochgeladen ✅\nTraining-ID: ${id}`;box.className='diag ok';log('Tredict FIT Upload erfolgreich: '+id);}
    else{box.textContent='Tredict Antwort erhalten, aber unerwartetes Format:\\n'+JSON.stringify(result,null,2);box.className='diag warn';log('Tredict Upload: unerwartete Antwort.');}
  }catch(e){box.textContent='Tredict FIT Upload FEHLER: '+(e?.message||String(e));box.className='diag warn';log('Tredict FIT Upload FEHLER: '+(e?.message||String(e)));}
}

function disconnectTrainer(){if(device?.gatt?.connected)device.gatt.disconnect();onTrainerDisconnected();}
function onTrainerDisconnected(){setStatus('Nicht verbunden');latestPower=0;latestCadence=null;latestRawSpeed=null;rawDistanceLastTs=null;document.getElementById('power').textContent='--';document.getElementById('cadence').textContent='--';document.getElementById('rawSpeed').textContent='--';log('KICKR getrennt.');updateButtons();}

log('360° Coach Ride Diagnostics v6 geladen.');
if('bluetooth' in navigator)log('Web Bluetooth erkannt.');else log('Web Bluetooth NICHT erkannt.');
log(`Web Share File Support: ${!!(navigator.share&&navigator.canShare)?'API vorhanden':'nicht vorhanden'}`);
loadWorkout('workouts/current.json','GitHub current.json');runPhysicsSelfTest();updateButtons();
