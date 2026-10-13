/* 360° Coach Ride Dashboard v1.1
   Presentation + athlete-zone layer. Keeps trainer control/session logic separate. */
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

  function structuredCloneSafe(v){return JSON.parse(JSON.stringify(v))}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function el(id){return document.getElementById(id)}
  function fmtDate(iso){
    if(!iso)return '—';
    const d=new Date(`${iso}T12:00:00`);
    return Number.isNaN(d.getTime())?iso:d.toLocaleDateString('de-DE');
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
    renderZoneBasis();
    updateZonePresentation();
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

  ensureDashboardStructure();
  renderZoneBasis();
  loadAthleteConfig();

  const baseUpdateLiveSensorText=window.updateLiveSensorText;
  if(typeof baseUpdateLiveSensorText==='function'){
    window.updateLiveSensorText=function(){baseUpdateLiveSensorText();updateZonePresentation()};
  }
  const baseRenderRideWorkout=window.renderRideWorkout;
  if(typeof baseRenderRideWorkout==='function'){
    window.renderRideWorkout=function(){ensureDashboardStructure();baseRenderRideWorkout();updateZonePresentation()};
  }

  window.addEventListener('resize',ensureDashboardStructure,{passive:true});
  window.rideAthleteConfig=()=>structuredCloneSafe(athleteConfig);
})();
