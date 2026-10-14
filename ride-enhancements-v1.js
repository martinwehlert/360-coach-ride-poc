/* 360° Coach Ride Enhancements v1.0
   Focused live-ride UX layer: workout title, 3-block preview, cadence corridor,
   larger primary metrics and 15 s block briefing overlays.

   Optional interval briefing schema (backward compatible):
   workout.briefingGroups = [{ id, name, description }]
   step.briefingGroupId = 'same-id' for every step inside that interval group.
   The group is announced once on entry; internal short steps do not trigger overlays.
*/
(function(){
  'use strict';

  const ZONE_COLORS={z1:'#309fe6',z2:'#36b85f',z3:'#f3bd24',z4:'#f58a2a',z5:'#ef4357',neutral:'#10233a'};
  let lastBriefingKey=null;

  function q(sel){return document.querySelector(sel)}
  function byId(id){return document.getElementById(id)}
  function esc(s){return String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
  function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
  function ftp(){const c=window.rideAthleteConfig?.();return Number(c?.cycling?.ftpW)||270}
  function pctForStep(step){
    if(Number.isFinite(Number(step?._targetPct)))return Number(step._targetPct);
    if(step?.target?.type==='ftpPercent'&&Number.isFinite(Number(step.target.value)))return Number(step.target.value);
    const w=Number(step?.targetPower),f=ftp();return Number.isFinite(w)&&f>0?w/f:null;
  }
  function zoneForStep(step){
    const p=pctForStep(step);if(!Number.isFinite(p))return {key:'neutral',color:ZONE_COLORS.neutral};
    if(p<=.55)return {key:'z1',color:ZONE_COLORS.z1};
    if(p<=.75)return {key:'z2',color:ZONE_COLORS.z2};
    if(p<=.90)return {key:'z3',color:ZONE_COLORS.z3};
    if(p<=1.05)return {key:'z4',color:ZONE_COLORS.z4};
    return {key:'z5',color:ZONE_COLORS.z5};
  }
  function stepTargetText(step){
    if(!step)return '—';const p=pctForStep(step),w=Number(step.targetPower);
    if(Number.isFinite(p)&&Number.isFinite(w))return `${Math.round(p*100)} % FTP · ${Math.round(w)} W`;
    return Number.isFinite(w)?`${Math.round(w)} W`:'—';
  }

  function injectStyle(){
    if(byId('rideEnhancementStyles'))return;
    const s=document.createElement('style');s.id='rideEnhancementStyles';s.textContent=`
      #screenRide .ride-header{position:relative}
      #screenRide .ride-workout-chip{min-width:0;max-width:310px;flex:1 1 250px;margin-left:auto;padding:7px 12px;border:1px solid #dbe5ec;border-radius:13px;background:rgba(255,255,255,.9);text-align:center;box-shadow:0 3px 10px rgba(31,60,86,.05)}
      #screenRide .ride-workout-chip small{display:block;text-transform:uppercase;letter-spacing:.10em;color:#7a8b9a;font-size:8px;font-weight:850}
      #screenRide .ride-workout-chip b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:1.2;color:#17334a}
      #screenRide .ride-statuses{margin-left:0!important}

      #screenRide .next-card{grid-template-rows:auto auto auto auto 1fr!important}
      #screenRide .next-card #rideNextName{margin-bottom:2px!important}
      #screenRide .upcoming-more{border-top:1px solid #e5edf2;margin-top:7px;padding-top:5px;display:grid;gap:4px;min-height:0}
      #screenRide .upcoming-row{display:grid;grid-template-columns:1fr auto;gap:6px;align-items:center;min-width:0}
      #screenRide .upcoming-row b{font-size:11px;line-height:1.05;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #screenRide .upcoming-row span{font-size:8px;color:#718493;white-space:nowrap}
      #screenRide .mini-profile{gap:5px!important;justify-content:flex-start!important;align-items:flex-end!important}
      #screenRide .mini-profile i{width:28px!important;border-radius:4px 4px 0 0!important;opacity:.95}

      #screenRide .cadence-card .metric-value{transition:color .2s ease}
      #screenRide .cadence-guide{margin-top:5px;display:grid;gap:3px}
      #screenRide .cadence-track{height:9px;border-radius:999px;background:#edf2f4;position:relative;overflow:visible;box-shadow:inset 0 0 0 1px rgba(16,35,58,.07)}
      #screenRide .cadence-corridor{position:absolute;top:0;bottom:0;border-radius:999px;background:#a7dfb3;border:1px solid #62bd75}
      #screenRide .cadence-marker{position:absolute;top:-3px;width:4px;height:15px;border-radius:3px;transform:translateX(-50%);background:#20a55a;box-shadow:0 0 0 1px #fff,0 1px 4px rgba(0,0,0,.15)}
      #screenRide .cadence-marker:before{content:'';position:absolute;width:8px;height:8px;border-radius:50%;background:inherit;left:50%;top:-2px;transform:translate(-50%,-50%);border:1px solid #fff}
      #screenRide .cadence-status{font-size:8px;font-weight:800;color:#647587;text-align:center}

      #screenRide .block-briefing-overlay{position:absolute;z-index:35;inset:0;display:grid;place-items:center;background:rgba(244,248,250,.84);backdrop-filter:blur(3px);pointer-events:none;opacity:1;transition:opacity .18s ease}
      #screenRide .block-briefing-overlay[hidden]{display:none!important}
      #screenRide .block-briefing-card{width:min(650px,76vw);background:#fff;border:2px solid #dce7ed;border-radius:22px;padding:22px 26px;box-shadow:0 18px 55px rgba(16,35,58,.22);text-align:center}
      #screenRide .block-briefing-kicker{text-transform:uppercase;letter-spacing:.15em;color:#668094;font-size:12px;font-weight:900}
      #screenRide .block-briefing-card h2{font-size:34px;line-height:1.05;margin:8px 0;color:#10233a}
      #screenRide .block-briefing-card p{font-size:18px;line-height:1.32;margin:0 auto;color:#52697c;max-width:590px}
      #screenRide .block-briefing-meta{margin-top:12px;font-size:13px;font-weight:850;color:#079ab2}

      @media (orientation:landscape) and (min-width:700px){
        #screenRide .power-number{font-size:clamp(78px,12.3vh,126px)!important}
        #screenRide .hr-card .metric-value{font-size:clamp(35px,6vh,51px)!important}
        #screenRide .cadence-card .metric-value,#screenRide .speed-card .metric-value{font-size:clamp(31px,5.2vh,45px)!important}
        #screenRide .block-main p{font-size:11px!important;line-height:1.18!important;max-height:40px!important}
        #screenRide .rpe-pill{font-size:11px!important;padding:5px 8px!important}
      }
      @media (orientation:landscape) and (min-width:700px) and (max-height:610px){
        #screenRide .ride-workout-chip{max-width:240px;padding:5px 9px}
        #screenRide .ride-workout-chip b{font-size:11px}#screenRide .ride-workout-chip small{font-size:7px}
        #screenRide .upcoming-more{gap:2px;margin-top:4px;padding-top:4px}.upcoming-row b{font-size:9px!important}.upcoming-row span{font-size:7px!important}
        #screenRide .block-briefing-card{padding:16px 20px}.block-briefing-card h2{font-size:28px!important}.block-briefing-card p{font-size:15px!important}
      }
    `;document.head.appendChild(s);
  }

  function ensureStructure(){
    injectStyle();
    const header=q('#screenRide .ride-header');
    if(header&&!byId('rideWorkoutChip')){
      const chip=document.createElement('div');chip.id='rideWorkoutChip';chip.className='ride-workout-chip';chip.innerHTML='<small>Workout</small><b id="rideWorkoutChipName">—</b>';
      const statuses=q('#screenRide .ride-statuses');header.insertBefore(chip,statuses||null);
    }
    const nextCard=q('#screenRide .next-card');
    if(nextCard&&!byId('upcomingMore')){
      const more=document.createElement('div');more.id='upcomingMore';more.className='upcoming-more';
      const mini=byId('nextMiniProfile');nextCard.insertBefore(more,mini||null);
    }
    const cadence=q('#screenRide .cadence-card');
    if(cadence&&!byId('cadenceGuide')){
      const guide=document.createElement('div');guide.id='cadenceGuide';guide.className='cadence-guide';
      guide.innerHTML='<div class="cadence-track"><i id="cadenceCorridor" class="cadence-corridor"></i><i id="cadenceMarker" class="cadence-marker"></i></div><div id="cadenceStatus" class="cadence-status">Kadenz-Ziel</div>';
      cadence.appendChild(guide);
    }
    const ride=q('#screenRide .ride-grid');
    if(ride&&!byId('blockBriefingOverlay')){
      const overlay=document.createElement('div');overlay.id='blockBriefingOverlay';overlay.className='block-briefing-overlay';overlay.hidden=true;
      overlay.innerHTML='<div class="block-briefing-card"><div class="block-briefing-kicker">Als nächstes folgt</div><h2 id="blockBriefingTitle">—</h2><p id="blockBriefingDescription"></p><div id="blockBriefingMeta" class="block-briefing-meta"></div></div>';
      ride.appendChild(overlay);
    }
  }

  function renderWorkoutName(){const e=byId('rideWorkoutChipName');if(e)e.textContent=state.workout?.name||'—'}

  function renderUpcoming(){
    const steps=state.workout?.steps||[],next=steps[state.currentStep+1];
    const nextName=byId('rideNextName');if(nextName&&next){nextName.style.color=zoneForStep(next).color}
    const box=byId('upcomingMore');if(box){
      box.innerHTML='';
      for(let i=state.currentStep+2;i<=state.currentStep+3;i++){
        const s=steps[i];if(!s)continue;const z=zoneForStep(s),row=document.createElement('div');row.className='upcoming-row';
        row.innerHTML=`<b style="color:${z.color}">${esc(s.name||`Block ${i+1}`)}</b><span>${fmt(Number(s.durationSec||0))} · ${esc(stepTargetText(s))}</span>`;box.appendChild(row);
      }
    }
    const mini=byId('nextMiniProfile');if(mini){
      mini.innerHTML='';
      const upcoming=steps.slice(state.currentStep+1,state.currentStep+4);const peak=Math.max(...upcoming.map(s=>Number(s.targetPower||0)),1);
      upcoming.forEach(s=>{const bar=document.createElement('i'),z=zoneForStep(s);bar.style.height=`${Math.max(9,Math.min(34,10+Number(s.targetPower||0)/peak*24))}px`;bar.style.background=z.color;bar.title=`${s.name||''} · ${stepTargetText(s)}`;mini.appendChild(bar)})
    }
  }

  function cadenceState(value,low,high){
    if(!Number.isFinite(value)||!Number.isFinite(low)||!Number.isFinite(high))return {color:'#607789',label:'Kadenz-Ziel nicht verfügbar'};
    if(value>=low&&value<=high)return {color:'#20a55a',label:`Ziel ${low}–${high} · im Korridor`};
    const d=value<low?low-value:value-high;
    if(d<=5)return {color:'#e2a718',label:`Ziel ${low}–${high} · ${Math.round(d)} rpm außerhalb`};
    return {color:'#df4050',label:`Ziel ${low}–${high} · ${Math.round(d)} rpm außerhalb`};
  }
  function renderCadence(){
    const s=typeof currentStep==='function'?currentStep():null,low=Number(s?.cadenceLow),high=Number(s?.cadenceHigh),v=Number(state.latestCadence);
    const marker=byId('cadenceMarker'),corr=byId('cadenceCorridor'),status=byId('cadenceStatus'),num=byId('rideCadence');if(!marker||!corr||!status||!num)return;
    if(!Number.isFinite(low)||!Number.isFinite(high)){marker.style.opacity='0';corr.style.opacity='.25';num.style.color='';status.textContent='Kein Kadenz-Korridor';return}
    const domainLow=low-10,domainHigh=high+10,span=Math.max(1,domainHigh-domainLow);
    corr.style.opacity='1';corr.style.left=`${clamp((low-domainLow)/span*100,0,100)}%`;corr.style.width=`${clamp((high-low)/span*100,3,100)}%`;
    const cs=cadenceState(v,low,high);status.textContent=cs.label;status.style.color=cs.color;num.style.color=Number.isFinite(v)?cs.color:'';
    marker.style.opacity=Number.isFinite(v)?'1':'0';marker.style.background=cs.color;if(Number.isFinite(v))marker.style.left=`${clamp((v-domainLow)/span*100,0,100)}%`;
  }

  function renderRemainingRing(){
    const s=typeof currentStep==='function'?currentStep():null,ring=q('#screenRide .timer-ring');if(!s||!ring)return;
    const dur=Math.max(1,Number(s.durationSec||1)),remaining=Math.max(0,dur-state.stepElapsedMs/1000),ratio=clamp(remaining/dur,0,1);
    ring.style.background=`conic-gradient(var(--cyan) 0 ${ratio*100}%,#e7edf1 ${ratio*100}% 100%)`;
  }

  function groupForStep(step){
    const id=step?.briefingGroupId;if(!id)return null;
    return (state.workout?.briefingGroups||[]).find(g=>g.id===id)||{id,name:step.name,description:step.note||step.description||''};
  }
  function groupDurationFrom(index,groupId){
    let d=0;const steps=state.workout?.steps||[];
    for(let i=index;i<steps.length&&steps[i]?.briefingGroupId===groupId;i++)d+=Number(steps[i].durationSec||0);
    return d;
  }
  function nextBriefingTarget(){
    const steps=state.workout?.steps||[],nextIndex=state.currentStep+1,next=steps[nextIndex];if(!next)return null;
    const nextGroup=groupForStep(next),currentGroupId=steps[state.currentStep]?.briefingGroupId||null;
    if(nextGroup){
      if(next.briefingGroupId===currentGroupId)return null;
      const duration=groupDurationFrom(nextIndex,next.briefingGroupId);
      if(duration<=30)return null;
      return {key:`group:${next.briefingGroupId}:${nextIndex}`,title:nextGroup.name||next.name,description:nextGroup.description||nextGroup.note||next.note||'',meta:`${fmt(duration)} · Intervallblock`};
    }
    if(Number(next.durationSec||0)<=30)return null;
    return {key:`step:${nextIndex}`,title:next.name||`Block ${nextIndex+1}`,description:next.note||next.description||'',meta:`${fmt(Number(next.durationSec||0))} · ${stepTargetText(next)}`};
  }
  function hideBriefing(){const o=byId('blockBriefingOverlay');if(o)o.hidden=true}
  function renderBriefing(){
    if(!state.sessionActive||state.paused||state.previewMode){hideBriefing();return}
    const s=typeof currentStep==='function'?currentStep():null;if(!s){hideBriefing();return}
    const remaining=Math.max(0,Number(s.durationSec||0)-state.stepElapsedMs/1000);
    if(remaining>15.1){lastBriefingKey=null;hideBriefing();return}
    if(remaining<=5){hideBriefing();return}
    const target=nextBriefingTarget();if(!target){hideBriefing();return}
    const transitionKey=`${state.currentStep}->${state.currentStep+1}:${target.key}`;
    if(lastBriefingKey&&lastBriefingKey!==transitionKey){lastBriefingKey=null}
    if(!lastBriefingKey)lastBriefingKey=transitionKey;
    if(lastBriefingKey!==transitionKey){hideBriefing();return}
    byId('blockBriefingTitle').textContent=target.title;
    byId('blockBriefingDescription').textContent=target.description||'Bereit für den nächsten Abschnitt.';
    byId('blockBriefingMeta').textContent=target.meta||'';
    byId('blockBriefingOverlay').hidden=false;
  }

  function updateAll(){
    ensureStructure();renderWorkoutName();renderUpcoming();renderCadence();renderRemainingRing();renderBriefing();
  }

  ensureStructure();updateAll();

  const baseRender=window.renderRideWorkout;
  if(typeof baseRender==='function')window.renderRideWorkout=function(){const r=baseRender.apply(this,arguments);updateAll();return r};
  const baseLive=window.updateLiveSensorText;
  if(typeof baseLive==='function')window.updateLiveSensorText=function(){const r=baseLive.apply(this,arguments);renderCadence();return r};
  const baseUi=window.updateRideUi;
  if(typeof baseUi==='function')window.updateRideUi=function(){const r=baseUi.apply(this,arguments);renderRemainingRing();renderCadence();renderBriefing();return r};

  setInterval(()=>{if(state.screen==='ride'||state.sessionActive)updateAll()},250);
  window.rideDashboardEnhancements={update:updateAll,briefingSchema:'briefingGroups + step.briefingGroupId'};
  if(typeof log==='function')log('Ride Dashboard Enhancements v1.0 aktiv.');
})();
