/* 360° Coach Ride Dashboard v1.2
   Presentation + athlete-zone layer + workout schema v3 + workout library. */
(function(){
  'use strict';

  const DEFAULT_ATHLETE_CONFIG={
    schemaVersion:1,
    athlete:'Martin Wehlert',
    updatedAt:'2026-10-13',
    cycling:{ftpW:270,lthrBpm:155},
    source:{ftp:'working_value',lthr:'historical_inference'},
    confidence:{ftp:'moderate',lthr:'moderate'}
  };
  const ZONE_COLORS={
    z1:'#309fe6', z2:'#36b85f', z3:'#f3bd24', z4:'#f58a2a',
    z5:'#ef4357', z5a:'#ef5661', z5b:'#d92f45', z5c:'#a70d20', neutral:'#10233a'
  };
  let athleteConfig=structuredCloneSafe(DEFAULT_ATHLETE_CONFIG);
  const libraryState={index:[],week:null,workouts:[],ready:false};

  function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v))}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function el(id){return document.getElementById(id)}
  function fmtDate(iso){
    if(!iso)return '—';
    const d=new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime())?iso:d.toLocaleDateString('de-DE');
  }
  function phaseLabel(v){return ({base:'Base',build:'Build',peak:'Peak','race-specific':'Race specific'}[v]||v||'—')}
  function goalLabel(v){return ({'technical-test':'Technik-Test','erg-control':'ERG','dashboard-validation':'Dashboard','bridge-validation':'Bridge','aerobic-endurance':'Aerobic Endurance',tempo:'Tempo',threshold:'Threshold','vo2max':'VO₂max',recovery:'Recovery',durability:'Durability','race-specific':'Race Specific',cadence:'Kadenz','ftp-test':'FTP-Test'}[v]||v||'—')}

  function resolveStepTarget(step){
    if(!step||typeof step!=='object')return step;
    const ftp=Number(athleteConfig.cycling.ftpW);
    const target=step.target;
    if(target?.type==='ftpPercent'){
      const value=Number(target.value);
      if(Number.isFinite(value)&&Number.isFinite(ftp)&&ftp>0){
        step.targetPower=Math.round(value*ftp);
        step.targetLow=Number.isFinite(Number(target.low))?Math.round(Number(target.low)*ftp):step.targetPower;
        step.targetHigh=Number.isFinite(Number(target.high))?Math.round(Number(target.high)*ftp):step.targetPower;
        step._targetPct=value;
      }
    }else if(target?.type==='absolutePower'){
      const value=Number(target.value);
      if(Number.isFinite(value)){
        step.targetPower=Math.round(value);
        step.targetLow=Number.isFinite(Number(target.low))?Math.round(Number(target.low)):step.targetPower;
        step.targetHigh=Number.isFinite(Number(target.high))?Math.round(Number(target.high)):step.targetPower;
        step._targetPct=Number.isFinite(ftp)&&ftp>0?step.targetPower/ftp:null;
      }
    }else if(Number.isFinite(Number(step.targetPower))){
      step.targetPower=Math.round(Number(step.targetPower));
      step._targetPct=Number.isFinite(ftp)&&ftp>0?step.targetPower/ftp:null;
    }
    return step;
  }

  function resolveWorkoutTargets(workout){
    if(!workout?.steps)return workout;
    workout.steps.forEach(resolveStepTarget);
    workout._resolvedForFtp=Number(athleteConfig.cycling.ftpW);
    return workout;
  }

  function stepPct(step){
    if(Number.isFinite(Number(step?._targetPct)))return Number(step._targetPct);
    const ftp=Number(athleteConfig.cycling.ftpW);
    const watts=Number(step?.targetPower);
    return Number.isFinite(ftp)&&ftp>0&&Number.isFinite(watts)?watts/ftp:null;
  }

  function stepTargetLabel(step){
    if(!step)return '—';
    const pct=stepPct(step),watts=Number(step.targetPower);
    if(Number.isFinite(pct)&&step.target?.type==='ftpPercent')return `${Math.round(pct*100)} % FTP · ${Math.round(watts)} W`;
    return Number.isFinite(watts)?`${Math.round(watts)} W`:'—';
  }

  const baseFetchWorkout=window.fetchWorkout;
  if(typeof baseFetchWorkout==='function'){
    window.fetchWorkout=async function(path,label){
      const workout=await baseFetchWorkout(path,label);
      return resolveWorkoutTargets(workout);
    };
  }

  async function loadAthleteConfig(){
    try{
      const r=await fetch(`athlete-config.json?ts=${Date.now()}`,{cache:'no-store'});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const raw=await r.json();
      const ftp=Number(raw?.cycling?.ftpW),lthr=Number(raw?.cycling?.lthrBpm);
      if(!Number.isFinite(ftp)||ftp<100||ftp>600)throw new Error('FTP unplausibel');
      if(!Number.isFinite(lthr)||lthr<100||lthr>220)throw new Error('LTHR unplausibel');
      athleteConfig={...structuredCloneSafe(DEFAULT_ATHLETE_CONFIG),...raw,cycling:{...DEFAULT_ATHLETE_CONFIG.cycling,...raw.cycling}};
      if(typeof log==='function')log(`Athlete config geladen: FTP ${ftp} W · Cycling-LTHR ${lthr} bpm`);
    }catch(e){
      athleteConfig=structuredCloneSafe(DEFAULT_ATHLETE_CONFIG);
      if(typeof log==='function')log(`Athlete config Fallback: ${e.message}`);
    }
    if(window.state?.workout){resolveWorkoutTargets(state.workout);try{renderMenuWorkout();renderRideWorkout()}catch{}}
    libraryState.workouts.forEach(x=>resolveWorkoutTargets(x.workout));
    renderZoneBasis();
    updateZonePresentation();
    renderWorkoutLibrary();
  }

  function renderZoneBasis(){
    ensureDashboardStructure();
    const ftp=Number(athleteConfig.cycling.ftpW),lthr=Number(athleteConfig.cycling.lthrBpm);
    const ftpEl=el('menuFtpValue'),lthrEl=el('menuLthrValue'),dateEl=el('menuZoneDate');
    if(ftpEl)ftpEl.textContent=`${Math.round(ftp)} W`;
    if(lthrEl)lthrEl.textContent=`${Math.round(lthr)} bpm`;
    if(dateEl)dateEl.textContent=fmtDate(athleteConfig.updatedAt);
  }

  function createScale(id,type){
    const wrap=document.createElement('div');
    wrap.id=id;wrap.className=`zone-scale ${type}-zone-scale`;
    wrap.setAttribute('aria-label',type==='power'?'Leistungszonen nach FTP':'Herzfrequenzzonen nach Cycling-LTHR');
    const defs=type==='power'
      ?[['z1','Z1','<55%'],['z2','Z2','56–75%'],['z3','Z3','76–90%'],['z4','Z4','91–105%'],['z5','Z5','≥106%']]
      :[['z1','Z1','<81%'],['z2','Z2','81–89%'],['z3','Z3','90–93%'],['z4','Z4','94–99%'],['z5a','Z5a','100–102%'],['z5b','Z5b','103–106%'],['z5c','Z5c','>106%']];
    const track=document.createElement('div');track.className='zone-track';
    const labels=document.createElement('div');labels.className='zone-labels';
    for(const [cls,name,range] of defs){
      const seg=document.createElement('span');seg.className=cls;seg.style.background=ZONE_COLORS[cls];track.appendChild(seg);
      const lab=document.createElement('span');lab.className=cls;lab.innerHTML=`<b>${name}</b><small>${range}</small>`;labels.appendChild(lab);
    }
    const marker=document.createElement('i');marker.className='zone-marker';marker.setAttribute('aria-hidden','true');
    wrap.append(track,marker,labels);
    return wrap;
  }

  function ensureDashboardStructure(){
    const grid=document.querySelector('#screenRide .ride-grid');
    const hero=document.querySelector('#screenRide .hero-power');
    if(!grid||!hero)return;

    if(!el('powerZoneScale'))hero.appendChild(createScale('powerZoneScale','power'));

    const metricRow=hero.querySelector('.metric-row');
    if(metricRow){
      const cards=[...metricRow.querySelectorAll('.metric-card')];
      const classes=['hr-card','cadence-card','speed-card'];
      cards.forEach((card,i)=>{
        card.classList.add('panel','ride-metric-panel',classes[i]||'');
        grid.insertBefore(card,document.querySelector('#screenRide .profile-card'));
      });
      metricRow.remove();
    }

    const hrCard=document.querySelector('#screenRide .hr-card');
    if(hrCard&&!el('hrZoneScale'))hrCard.appendChild(createScale('hrZoneScale','hr'));

    const block=document.querySelector('#screenRide .block-card');
    const next=block?.querySelector('.next-block');
    if(next&&!next.classList.contains('next-card')){
      next.classList.add('panel','next-card');
      grid.insertBefore(next,document.querySelector('#screenRide .profile-card'));
    }

    const bikeCard=document.querySelector('#screenMenu .bike-card');
    if(bikeCard&&!el('zoneBasisCard')){
      const zone=document.createElement('div');zone.id='zoneBasisCard';zone.className='zone-basis-card';
      zone.innerHTML='<span class="zone-basis-label">Zonenbasis</span><div><small>FTP</small><b id="menuFtpValue">270 W</b></div><div><small>Cycling-LTHR</small><b id="menuLthrValue">155 bpm</b></div><div><small>Stand</small><b id="menuZoneDate">13.10.2026</b></div><p>Arbeitswerte für Dashboard & Zonen · Anpassung über athlete-config.json</p>';
      bikeCard.appendChild(zone);
    }

    const actions=document.querySelector('#screenMenu .secondary-actions');
    if(actions&&!el('btnWorkoutLibrary')){
      const b=document.createElement('button');b.id='btnWorkoutLibrary';b.className='icon-btn';b.innerHTML='<svg class="ui-icon"><use href="#i-workout"/></svg><span>Workout-Bibliothek</span>';b.onclick=openWorkoutLibrary;actions.prepend(b);
    }
  }

  function powerZone(power){
    const ftp=Number(athleteConfig.cycling.ftpW);
    if(!Number.isFinite(power)||power<=0||!Number.isFinite(ftp)||ftp<=0)return {key:'neutral',name:'—',pct:null};
    const r=power/ftp;
    if(r<=.55)return {key:'z1',name:'Z1',pct:r};
    if(r<=.75)return {key:'z2',name:'Z2',pct:r};
    if(r<=.90)return {key:'z3',name:'Z3',pct:r};
    if(r<=1.05)return {key:'z4',name:'Z4',pct:r};
    return {key:'z5',name:'Z5',pct:r};
  }
  function hrZone(hr){
    const lthr=Number(athleteConfig.cycling.lthrBpm);
    if(!Number.isFinite(hr)||hr<=0||!Number.isFinite(lthr)||lthr<=0)return {key:'neutral',name:'—',pct:null};
    const r=hr/lthr;
    if(r<.81)return {key:'z1',name:'Z1',pct:r};
    if(r<.90)return {key:'z2',name:'Z2',pct:r};
    if(r<.94)return {key:'z3',name:'Z3',pct:r};
    if(r<1.00)return {key:'z4',name:'Z4',pct:r};
    if(r<1.03)return {key:'z5a',name:'Z5a',pct:r};
    if(r<1.07)return {key:'z5b',name:'Z5b',pct:r};
    return {key:'z5c',name:'Z5c',pct:r};
  }

  function equalSegmentMarker(ratio,ranges){
    if(!Number.isFinite(ratio))return null;
    let idx=ranges.findIndex(([lo,hi])=>ratio>=lo&&ratio<hi);
    if(idx<0)idx=ratio<ranges[0][0]?0:ranges.length-1;
    const [lo,hi]=ranges[idx];
    const frac=clamp((ratio-lo)/(hi-lo),0,1);
    return ((idx+frac)/ranges.length)*100;
  }
  function setMarker(scaleId,pct,type,color){
    const marker=document.querySelector(`#${scaleId} .zone-marker`);if(!marker)return;
    const ranges=type==='power'
      ?[[0,.55],[.55,.75],[.75,.90],[.90,1.05],[1.05,1.50]]
      :[[.50,.81],[.81,.90],[.90,.94],[.94,1.00],[1.00,1.03],[1.03,1.07],[1.07,1.15]];
    const pos=equalSegmentMarker(pct,ranges);
    marker.style.opacity=pos==null?'0':'1';
    if(pos!=null)marker.style.left=`${clamp(pos,1,99)}%`;
    marker.style.setProperty('--marker-color',color||ZONE_COLORS.neutral);
  }

  function updateZonePresentation(){
    ensureDashboardStructure();
    const p=typeof power3s==='function'?Number(power3s()):Number(state.latestPower);
    const hr=Number(state.latestHr);
    const pz=powerZone(p),hz=hrZone(hr);
    const powerEl=el('ridePower3s'),hrEl=el('rideHeartRate');
    const pColor=ZONE_COLORS[pz.key]||ZONE_COLORS.neutral,hColor=ZONE_COLORS[hz.key]||ZONE_COLORS.neutral;
    if(powerEl)powerEl.style.color=pz.key==='neutral'?'':pColor;
    if(hrEl)hrEl.style.color=hz.key==='neutral'?'':hColor;
    setMarker('powerZoneScale',pz.pct,'power',pColor);
    setMarker('hrZoneScale',hz.pct,'hr',hColor);
    const hrZoneEl=el('rideHrZone');
    if(hrZoneEl){
      hrZoneEl.textContent=hz.key==='neutral'?'HF live':`${hz.name} · Cycling-LTHR ${Math.round(athleteConfig.cycling.lthrBpm)} bpm`;
      hrZoneEl.style.color=hz.key==='neutral'?'':hColor;
    }
  }

  function metricsForWorkout(workout){
    const steps=workout?.steps||[];
    const duration=steps.reduce((s,x)=>s+Number(x.durationSec||0),0);
    let weighted=0,maxPct=0,known=0;
    for(const step of steps){
      const pct=stepPct(step),sec=Number(step.durationSec||0);
      if(Number.isFinite(pct)&&sec>0){weighted+=pct*sec;known+=sec;maxPct=Math.max(maxPct,pct)}
    }
    return {
      durationSec:duration,
      avgPct:known?weighted/known:null,
      maxPct:known?maxPct:null,
      rpe:Number(workout?.classification?.expectedSessionRpe),
      phases:workout?.classification?.recommendedPhases||[],
      goal:workout?.classification?.primaryGoal||'—'
    };
  }

  function injectLibraryUi(){
    if(el('dialogLibrary'))return;
    const style=document.createElement('style');
    style.textContent=`
      #dialogLibrary{width:min(1180px,96vw);max-width:none;padding:0;border:0;background:transparent}
      #dialogLibrary::backdrop{background:rgba(16,35,58,.45);backdrop-filter:blur(4px)}
      .library-shell{background:#f7fafc;border-radius:24px;padding:24px;max-height:88vh;overflow:auto;box-shadow:0 24px 70px rgba(16,35,58,.28)}
      .library-toolbar{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:10px;margin:18px 0}
      .library-toolbar input,.library-toolbar select{width:100%;border:1px solid #d9e3ea;border-radius:12px;background:white;padding:11px 12px;font:inherit;color:#10233a}
      .library-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .library-card{border:1px solid #dce7ee;border-radius:16px;background:white;padding:15px;text-align:left;display:grid;gap:8px;box-shadow:0 4px 14px rgba(16,35,58,.04)}
      .library-card h3{margin:0;font-size:17px;color:#10233a}.library-card p{margin:0;color:#607789;font-size:13px;line-height:1.35}
      .library-meta{display:flex;flex-wrap:wrap;gap:7px}.library-chip{background:#eef5f8;color:#315368;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:700}
      .library-card .library-select{justify-self:start;margin-top:4px;border:0;border-radius:10px;background:#10233a;color:white;padding:9px 12px;font-weight:800}
      .week-picker-title{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#6d8291;font-weight:800;margin:4px 0 8px}
      .week-picker-item{width:100%;border:1px solid #dce7ee;border-radius:12px;background:white;padding:11px 12px;text-align:left;margin:0 0 8px;display:flex;justify-content:space-between;gap:12px;align-items:center}
      .week-picker-item b{display:block;color:#10233a}.week-picker-item small{color:#708596}.week-picker-date{font-weight:800;color:#079ab2;white-space:nowrap}
      .library-open-row{display:flex;justify-content:center;padding-top:8px}.library-open-row button{border:0;background:#eef7f8;color:#087f92;border-radius:999px;padding:9px 14px;font-weight:800}
      @media(max-width:850px){.library-toolbar{grid-template-columns:1fr 1fr}.library-toolbar input{grid-column:1/-1}.library-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
    const d=document.createElement('dialog');d.id='dialogLibrary';d.innerHTML=`
      <div class="library-shell">
        <div class="modal-head"><div><h2 style="margin:0">Workout-Bibliothek</h2><p style="margin:4px 0 0;color:#718493">Filtern, vergleichen und spontan ein passendes Workout wählen.</p></div><button id="btnCloseLibrary" class="icon-only"><svg class="ui-icon"><use href="#i-x"/></svg></button></div>
        <div class="library-toolbar">
          <input id="librarySearch" type="search" placeholder="Workout suchen …">
          <select id="libraryDuration"><option value="all">Alle Längen</option><option value="45">≤ 45 min</option><option value="75">46–75 min</option><option value="120">76–120 min</option><option value="long">> 120 min</option></select>
          <select id="libraryPhase"><option value="all">Alle Phasen</option><option value="base">Base</option><option value="build">Build</option><option value="peak">Peak</option><option value="race-specific">Race specific</option></select>
          <select id="libraryRpe"><option value="all">Alle RPE</option><option value="easy">RPE 1–3</option><option value="moderate">RPE 4–6</option><option value="hard">RPE 7–10</option></select>
          <select id="libraryIntensity"><option value="all">Ø alle Intensitäten</option><option value="lt60">< 60 % FTP</option><option value="60-75">60–75 % FTP</option><option value="76-90">76–90 % FTP</option><option value="gt90">> 90 % FTP</option></select>
        </div>
        <div id="libraryResults" class="library-grid"></div>
      </div>`;
    document.body.appendChild(d);
    el('btnCloseLibrary').onclick=()=>d.close();
    ['librarySearch','libraryDuration','libraryPhase','libraryRpe','libraryIntensity'].forEach(id=>el(id).addEventListener('input',renderWorkoutLibrary));
  }

  function openWorkoutLibrary(){
    injectLibraryUi();
    if(el('dialogWorkouts')?.open)el('dialogWorkouts').close();
    renderWorkoutLibrary();
    el('dialogLibrary').showModal();
  }

  function passesFilters(item){
    const w=item.workout,m=metricsForWorkout(w);
    const q=(el('librarySearch')?.value||'').trim().toLowerCase();
    const duration=el('libraryDuration')?.value||'all',phase=el('libraryPhase')?.value||'all',rpe=el('libraryRpe')?.value||'all',intensity=el('libraryIntensity')?.value||'all';
    if(q){const hay=[w.name,w.description,w.classification?.primaryGoal,...(w.classification?.secondaryGoals||[]),...(w.classification?.tags||[])].join(' ').toLowerCase();if(!hay.includes(q))return false}
    const min=m.durationSec/60;
    if(duration==='45'&&min>45)return false;if(duration==='75'&&(min<=45||min>75))return false;if(duration==='120'&&(min<=75||min>120))return false;if(duration==='long'&&min<=120)return false;
    if(phase!=='all'&&!m.phases.includes(phase))return false;
    if(rpe!=='all'&&Number.isFinite(m.rpe)){if(rpe==='easy'&&m.rpe>3)return false;if(rpe==='moderate'&&(m.rpe<4||m.rpe>6))return false;if(rpe==='hard'&&m.rpe<7)return false}
    if(intensity!=='all'&&Number.isFinite(m.avgPct)){const p=m.avgPct*100;if(intensity==='lt60'&&p>=60)return false;if(intensity==='60-75'&&(p<60||p>75))return false;if(intensity==='76-90'&&(p<76||p>90))return false;if(intensity==='gt90'&&p<=90)return false}
    return true;
  }

  function renderWorkoutLibrary(){
    const box=el('libraryResults');if(!box)return;
    if(!libraryState.ready){box.innerHTML='<p>Bibliothek wird geladen …</p>';return}
    const items=libraryState.workouts.filter(passesFilters);
    if(!items.length){box.innerHTML='<p>Keine Workouts passen zu den aktuellen Filtern.</p>';return}
    box.innerHTML='';
    for(const item of items){
      const w=item.workout,m=metricsForWorkout(w),card=document.createElement('article');card.className='library-card';
      const avgPct=Number.isFinite(m.avgPct)?`${Math.round(m.avgPct*100)} % FTP`:'—';
      const avgW=Number.isFinite(m.avgPct)?`${Math.round(m.avgPct*Number(athleteConfig.cycling.ftpW))} W`:'—';
      const phases=m.phases.map(phaseLabel).join(' · ')||'—';
      card.innerHTML=`<h3>${escapeHtml(w.name)}</h3><p>${escapeHtml(w.description||'')}</p><div class="library-meta"><span class="library-chip">${fmt(m.durationSec)}</span><span class="library-chip">Ø ${avgPct} · ${avgW}</span><span class="library-chip">Peak ${Number.isFinite(m.maxPct)?Math.round(m.maxPct*100)+' % FTP':'—'}</span><span class="library-chip">RPE ${Number.isFinite(m.rpe)?m.rpe:'—'}</span><span class="library-chip">${escapeHtml(goalLabel(m.goal))}</span><span class="library-chip">${escapeHtml(phases)}</span></div><button class="library-select">Workout auswählen</button>`;
      card.querySelector('.library-select').onclick=async()=>{await loadWorkout(item.path,'Workout-Bibliothek');el('dialogLibrary')?.close();toast('Workout aus Bibliothek geladen')};
      box.appendChild(card);
    }
  }

  function renderWeeklyWorkoutPicker(){
    const box=el('workoutList');if(!box)return;
    if(!libraryState.ready){box.innerHTML='<p>Wochenplan wird geladen …</p>';return}
    const planned=libraryState.week?.plannedWorkouts||[];
    box.innerHTML='<div class="week-picker-title">Geplant diese Woche</div>';
    if(!planned.length)box.innerHTML+='<p>Für diese Woche sind noch keine Radworkouts hinterlegt.</p>';
    for(const plan of planned){
      const item=libraryState.workouts.find(x=>x.workout.id===plan.workoutId);if(!item)continue;
      const m=metricsForWorkout(item.workout),b=document.createElement('button');b.className='week-picker-item';
      b.innerHTML=`<span><b>${escapeHtml(item.workout.name)}</b><small>${fmt(m.durationSec)} · RPE ${Number.isFinite(m.rpe)?m.rpe:'—'} · Ø ${Number.isFinite(m.avgPct)?Math.round(m.avgPct*100)+' % FTP':'—'}</small></span><span class="week-picker-date">${fmtDate(plan.date)}</span>`;
      b.onclick=async()=>{el('dialogWorkouts')?.close();await loadWorkout(item.path,'Wochenplan')};box.appendChild(b);
    }
    const row=document.createElement('div');row.className='library-open-row';row.innerHTML='<button type="button">Workout-Bibliothek öffnen</button>';row.querySelector('button').onclick=openWorkoutLibrary;box.appendChild(row);
  }

  const baseRenderWorkoutList=window.renderWorkoutList;
  window.renderWorkoutList=function(){
    if(libraryState.ready)return renderWeeklyWorkoutPicker();
    if(typeof baseRenderWorkoutList==='function')baseRenderWorkoutList();
  };

  async function loadLibraryData(){
    try{
      const [idxRes,weekRes]=await Promise.all([
        fetch(`workouts/library-index.json?ts=${Date.now()}`,{cache:'no-store'}),
        fetch(`workouts/week-plan.json?ts=${Date.now()}`,{cache:'no-store'})
      ]);
      if(!idxRes.ok)throw new Error(`Library HTTP ${idxRes.status}`);
      const idx=await idxRes.json();libraryState.index=idx.workouts||[];
      libraryState.week=weekRes.ok?await weekRes.json():{plannedWorkouts:[]};
      const loaded=[];
      for(const item of libraryState.index){
        try{const workout=await window.fetchWorkout(item.path,item.label||'Workout-Bibliothek');loaded.push({...item,workout})}catch(e){if(typeof log==='function')log(`Library Workout Fehler ${item.path}: ${e.message}`)}
      }
      libraryState.workouts=loaded;libraryState.ready=true;
      renderWorkoutLibrary();
      if(el('dialogWorkouts')?.open)renderWeeklyWorkoutPicker();
      if(typeof log==='function')log(`Workout-Bibliothek geladen: ${loaded.length} Workouts`);
    }catch(e){
      libraryState.ready=true;libraryState.workouts=[];libraryState.week={plannedWorkouts:[]};
      if(typeof log==='function')log(`Workout-Bibliothek Fehler: ${e.message}`);
    }
  }

  ensureDashboardStructure();
  renderZoneBasis();
  injectLibraryUi();
  loadAthleteConfig();
  loadLibraryData();

  const baseUpdateLiveSensorText=window.updateLiveSensorText;
  if(typeof baseUpdateLiveSensorText==='function'){
    window.updateLiveSensorText=function(){baseUpdateLiveSensorText();updateZonePresentation()};
  }
  const baseRenderRideWorkout=window.renderRideWorkout;
  if(typeof baseRenderRideWorkout==='function'){
    window.renderRideWorkout=function(){
      ensureDashboardStructure();
      if(state.workout)resolveWorkoutTargets(state.workout);
      baseRenderRideWorkout();updateZonePresentation();
      const s=typeof currentStep==='function'?currentStep():null,next=state.workout?.steps?.[state.currentStep+1];
      const prescription=el('rideBlockPrescription'),nextPrescription=el('rideNextPrescription');
      if(prescription&&s)prescription.textContent=`${fmt(s.durationSec)} @ ${stepTargetLabel(s)}`;
      if(nextPrescription&&next)nextPrescription.textContent=`${fmt(next.durationSec)} @ ${stepTargetLabel(next)}`;
    };
  }
  const baseRenderMenuWorkout=window.renderMenuWorkout;
  if(typeof baseRenderMenuWorkout==='function'){
    window.renderMenuWorkout=function(){
      if(state.workout)resolveWorkoutTargets(state.workout);
      baseRenderMenuWorkout();
      const m=metricsForWorkout(state.workout),peak=state.workout?.steps?.reduce((a,b)=>(stepPct(b)||0)>(stepPct(a)||0)?b:a,state.workout.steps?.[0]);
      const target=el('menuTarget');if(target&&peak){const pct=stepPct(peak);target.textContent=Number.isFinite(pct)?`${Math.round(pct*100)} % FTP · ${Math.round(peak.targetPower)} W`:`${Math.round(peak.targetPower)} W`}
      const source=el('menuSource');if(source&&state.workout?.schemaVersion>=3)source.textContent='Schema v3 · %FTP';
      const duration=el('menuDuration');if(duration&&m.durationSec)duration.textContent=fmt(m.durationSec);
    };
  }

  window.addEventListener('resize',ensureDashboardStructure,{passive:true});
  window.rideAthleteConfig=()=>structuredCloneSafe(athleteConfig);
  window.rideResolveWorkoutTargets=workout=>resolveWorkoutTargets(workout);
  window.openWorkoutLibrary=openWorkoutLibrary;
})();
