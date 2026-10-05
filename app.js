// Browser keeps only conveniences: who "me" is (my referral code) and an incoming ?ref= code.
// Registrations, referrals and the leaderboard live in the database behind /api.
const ME_KEY='waveloop_me', REF_KEY='waveloop_ref', AMB_KEY='waveloop_ambassador', POLL_MS=12000;
const store={get(k){try{return JSON.parse(localStorage.getItem(k))}catch{return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}},del(k){try{localStorage.removeItem(k)}catch{}}};
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function parseTracking(){const p=new URLSearchParams(location.search);return{ref:(p.get('ref')||'').trim().toUpperCase().slice(0,24),src:(p.get('src')||'').slice(0,40)}}

async function api(path,{method='GET',body}={}){
  let res,data;
  try{res=await fetch(`/api/${path}`,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});data=await res.json()}
  catch{throw Object.assign(new Error('Could not reach WaveLoop. Check your connection and try again.'),{code:'network'})}
  if(!res.ok||!data.ok){const e=data?.error||{};throw Object.assign(new Error(e.message||'Something went wrong.'),{code:e.code,fields:e.fields,status:res.status})}
  return data;
}
function errorText(err){return err.fields?Object.values(err.fields).join(' '):err.message}

// Poll while the tab is visible; refresh immediately when it becomes visible again.
function poll(fn){let timer=null;const tick=async()=>{clearTimeout(timer);if(!document.hidden){try{await fn()}catch{}}timer=setTimeout(tick,POLL_MS)};document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});tick();return tick}

// Theme
const themeToggle=$('#themeToggle');
if(localStorage.getItem('waveloop_theme')==='dark')document.documentElement.dataset.theme='dark';
themeToggle?.addEventListener('click',()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.setItem('waveloop_theme',dark?'light':'dark')});

// Mobile menu
$('#mobileMenu')?.addEventListener('click',()=>{const n=$('.nav-links');const open=n.dataset.open==='1';n.dataset.open=open?'0':'1';n.style.display=open?'none':'flex';n.style.position='absolute';n.style.top='66px';n.style.right='4vw';n.style.flexDirection='column';n.style.padding='14px';n.style.border='1px solid var(--line)';n.style.background='var(--paper)';n.style.borderRadius='14px';n.style.boxShadow='var(--shadow)'});
$$('.nav-links a').forEach(a=>a.addEventListener('click',()=>{const n=$('.nav-links');if(n.dataset.open==='1'){n.dataset.open='0';n.style.display='none'}}));

// Referral code from ?ref= is remembered so it survives navigation and a later visit.
const tracking=parseTracking();
if(tracking.ref)store.set(REF_KEY,{code:tracking.ref,src:tracking.src,at:Date.now()});
const incomingRef=()=>store.get(REF_KEY);
function prefillReferral(){const r=incomingRef();if(r?.code&&!$('#referredByInput').value)$('#referredByInput').value=r.code}
prefillReferral();
if(incomingRef()?.code)api(`referral-progress?code=${encodeURIComponent(incomingRef().code)}`).then(d=>{$('#registerNote').textContent=`Invited by ${d.owner_first_name} — their referral code is applied. Simulation only — no students are being contacted.`}).catch(()=>{});

// Register modal
const regDialog=$('#registerDialog'), successDialog=$('#successDialog'), registerForm=$('#registerForm');
$$('[data-open-register]').forEach(b=>b.addEventListener('click',()=>{prefillReferral();regDialog.showModal()}));
$('#cancelRegister')?.addEventListener('click',()=>regDialog.close()); $('#closeRegister')?.addEventListener('click',()=>regDialog.close());
$('#closeSuccess')?.addEventListener('click',()=>successDialog.close()); $('#closeSuccess2')?.addEventListener('click',()=>successDialog.close());
function referralLink(code){return `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}&src=Referral`}
function shareMessage(link){return `I just registered for “Build Your First AI Project in 60 Minutes”. It’s a free, focused AI build session for final-year students. Join me: ${link}`}

function paintMilestones(el,verified){[...el.children].forEach(s=>s.classList.toggle('done',verified>=+s.textContent))}
function renderProgress(progress){
  const v=Math.min(progress?.verified??0,5);
  $('#successProgressText').textContent=`${v} / 5`;$('#successProgressBar').style.width=`${v/5*100}%`;paintMilestones($('#successMilestones'),v);
}
const REFERRAL_STATUS={
  credited:r=>r.counts_toward_rewards?`Referral code ${r.code} applied — your referrer just got a verified sign-up.`:`Referral code ${r.code} recorded. Only 2027-batch sign-ups count toward your referrer's rewards.`,
  unknown_code:()=>'That referral code wasn’t found, so no one was credited. Your seat is still reserved.',
  self_referral:()=>'You can’t use your own ambassador code, so no referral was credited.',
  already_registered:()=>'This email was already registered — here is your existing personal link.',
};
function renderSuccess(result){
  const code=result.registration.own_referral_code;
  $('#refLinkText').textContent=referralLink(code);
  $('#successEyebrow').textContent=result.existing?'Welcome back':'You\'re in';
  const status=REFERRAL_STATUS[result.referral?.status]; const note=$('#referralStatus');
  note.hidden=!status; if(status)note.textContent=status(result.referral);
  renderProgress(result.progress); successDialog.showModal();
}

registerForm?.addEventListener('submit',async e=>{
  e.preventDefault();
  const err=$('#registerError'), submit=$('#registerSubmit'); err.hidden=true;
  if(!registerForm.reportValidity())return;
  const data=Object.fromEntries(new FormData(registerForm).entries());
  const ref=incomingRef();
  const body={...data,src:ref?.code&&data.referred_by_code.trim().toUpperCase()===ref.code?ref.src:tracking.src};
  submit.disabled=true;submit.textContent='Reserving…';
  try{
    const result=await api('register',{method:'POST',body});
    store.set(ME_KEY,{code:result.registration.own_referral_code,first_name:result.registration.first_name});
    if(result.referral?.status==='credited'||result.existing)store.del(REF_KEY);
    regDialog.close();registerForm.reset();$('#referredByInput').value='';
    renderSuccess(result);refreshMe();refreshBoard();refreshDash();
  }catch(x){err.textContent=errorText(x);err.hidden=false}
  finally{submit.disabled=false;submit.textContent='Reserve my seat →'}
});
async function copyWithFeedback(btn,text,done,idle){try{await navigator.clipboard.writeText(text);btn.textContent=done;setTimeout(()=>btn.textContent=idle,1200)}catch{alert(text)}}
$('#copyRef')?.addEventListener('click',()=>copyWithFeedback($('#copyRef'),$('#refLinkText').textContent,'✓','⧉'));
$('#shareWhatsApp')?.addEventListener('click',()=>{const link=$('#refLinkText').textContent;window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage(link))}`,'_blank','noopener')});
$('#copyShareText')?.addEventListener('click',()=>copyWithFeedback($('#copyShareText'),shareMessage($('#refLinkText').textContent),'Copied ✓','Copy share message'));
$('#goToHub')?.addEventListener('click',()=>{successDialog.close();document.querySelector('#myHub')?.scrollIntoView({behavior:'smooth'});});

// Hero stage rotation
const stages=[['Stage 01 · Define','Pick a useful problem.','Turn a placement pain point into an AI project you can describe in one sentence.'],['Stage 02 · Build','Ship the first working flow.','Prototype the smallest useful version, then test it like an evaluator will.'],['Stage 03 · Explain','Turn work into a story.','Finish with a demo path, GitHub-ready output and a 30-second interview answer.']];
let stageIndex=0; function renderStage(i){stageIndex=i;$('#buildStageLabel').textContent=stages[i][0];$('#buildStageTitle').textContent=stages[i][1];$('#buildStageText').textContent=stages[i][2];$('#stageProgressBar').style.width=`${34+i*33}%` ;$$('.stage-item').forEach((el,idx)=>el.classList.toggle('active',idx===i))}
setInterval(()=>renderStage((stageIndex+1)%3),4200);

// Experience tabs
const expCopy=[['01 / 03','Turn a placement pain point into a project.','Start with a problem you understand: resume analysis, interview prep, student productivity, or another concrete workflow.'],['02 / 03','Build the smallest useful version.','Focus on one user action, one AI capability and one visible outcome. The goal is a demo that works, not a feature list.'],['03 / 03','Package it for an interview.','Leave with a clean demo path, a GitHub-ready artifact and a concise explanation of what you built and why.']];
$$('.experience-tab').forEach(btn=>btn.addEventListener('click',()=>{const i=+btn.dataset.stage;$$('.experience-tab').forEach(x=>x.classList.remove('active'));btn.classList.add('active');const d=expCopy[i];$('#experienceDetail').innerHTML=`<div class="detail-badge">${d[0]}</div><h3>${esc(d[1])}</h3><p>${esc(d[2])}</p>`}));

// Project fit finder
const fitDialog=$('#fitDialog'); let quizStep=0, quiz={};
$('#openFitFinder')?.addEventListener('click',()=>{fitDialog.showModal();resetQuiz()}); $('#launchFitFinder')?.addEventListener('click',()=>{fitDialog.showModal();resetQuiz()}); $('#closeFit')?.addEventListener('click',()=>fitDialog.close());
function resetQuiz(){quizStep=0;quiz={};$$('.quiz-step').forEach((s,i)=>s.classList.toggle('active',i===0));$('#quizBar').style.width='33%';$('#fitModalResult').classList.remove('show');$('#fitModalResult').innerHTML=''}
$$('.choice-grid button').forEach(btn=>btn.addEventListener('click',()=>{quiz[btn.dataset.q]=btn.dataset.value;quizStep++;if(quizStep<3){$$('.quiz-step').forEach((s,i)=>s.classList.toggle('active',i===quizStep));$('#quizBar').style.width=`${(quizStep+1)*33.333}%`}else showFitResult()}));
function showFitResult(){const map={productivity:['AI Study Copilot','Build a small assistant that turns notes into an action plan and explains the reasoning.'],career:['Interview Story Builder','Build a tool that turns a project outline into a concise demo script and interview-ready talking points.'],education:['Learning Coach','Create a focused tutor that converts a concept into examples, questions and a mini revision loop.'],content:['Portfolio Content Copilot','Build a utility that turns project notes into a polished README, LinkedIn draft and demo checklist.']};const [title,desc]=map[quiz.problem]||map.career;$('#fitModalResult').innerHTML=`<h3>${title}</h3><p>${desc}</p><div class="result-actions"><button class="btn btn-primary" id="fitRegister">Build this in the workshop →</button><button class="btn btn-secondary" id="fitClose">Keep exploring</button></div>`;$('#fitModalResult').classList.add('show');$('#fitRegister').addEventListener('click',()=>{fitDialog.close();prefillReferral();regDialog.showModal()});$('#fitClose').addEventListener('click',()=>fitDialog.close())}

// Persistent student hub + reward ladder — real verified counts from the API.
function renderLadder(verified){
  $$('#rewardLadder .reward-step').forEach(step=>{const on=verified!=null&&verified>=+step.dataset.at;step.classList.toggle('unlocked',on);step.querySelector('strong').textContent=on?'✓':'○'});
  $('#ladderNote').textContent=verified==null?'Register to start your own ladder. Only verified final-year (2027) classmates count.':`You have ${verified} verified final-year referral${verified===1?'':'s'}. Updates every 12 seconds.`;
}
function renderHub(me,progress){
  const section=$('#myHub'), nav=$('#hubNav');
  if(!me){section.hidden=true;if(nav)nav.hidden=true;renderLadder(null);return}
  section.hidden=false;if(nav)nav.hidden=false;
  const count=progress?.verified??0, shown=Math.min(count,5);
  $('#hubLink').textContent=referralLink(me.code);$('#hubCount').textContent=shown;$('#hubBar').style.width=`${shown/5*100}%`;
  paintMilestones($('#hubMilestones'),count);
  const pending=progress?.not_qualified??0;
  $('#hubMuted').textContent=pending?`verified final-year classmates · ${pending} not 2027 batch`:'verified final-year classmates';
  const next=count<1?'1 referral':count<3?'3 referrals':count<5?'5 referrals':'All milestones unlocked';
  const reward=count<1?'Share your link once to start your reward ladder.':count<3?'Nice. One referral is verified — keep the loop moving.':count<5?'You have momentum. Push to the final referral tier.':'You reached the top referral tier.';
  $('#hubNext').textContent=next;$('#hubReward').textContent=reward;
  document.title=count?`WaveLoop · ${count} referral${count>1?'s':''}`:'WaveLoop — Build. Explain. Share.';
  renderLadder(count);
}
async function refreshMe(){
  const me=store.get(ME_KEY); if(!me?.code){renderHub(null);return}
  try{const d=await api(`referral-progress?code=${encodeURIComponent(me.code)}`);renderHub(me,d.progress)}
  catch(x){if(x.status===404){store.del(ME_KEY);renderHub(null)}else renderHub(me,null)}
}
$('#hubCopy')?.addEventListener('click',()=>copyWithFeedback($('#hubCopy'),$('#hubLink').textContent,'✓','⧉'));
$('#hubWhatsApp')?.addEventListener('click',()=>window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage($('#hubLink').textContent))}`,'_blank','noopener'));
$('#hubCopyMsg')?.addEventListener('click',()=>copyWithFeedback($('#hubCopyMsg'),shareMessage($('#hubLink').textContent),'Copied ✓','Copy message'));
$('#hubRegisterAgain')?.addEventListener('click',()=>document.querySelector('#growth').scrollIntoView({behavior:'smooth'}));
renderHub(store.get(ME_KEY)?{...store.get(ME_KEY)}:null,null);
poll(refreshMe);

// Live mini dashboard (operator preview)
async function refreshDash(){
  const [stats,series]=await Promise.all([api('stats'),api('daily-series')]);
  const sim=stats.includes_simulated;
  $('#dashLabel').textContent=sim?'SIMULATION':'LIVE DATA';
  $('#dashQualified').textContent=stats.qualified.toLocaleString('en-IN');
  $('#dashReferral').textContent=stats.qualified?`${Math.round(stats.verified_referrals/stats.qualified*100)}%`:'0%';
  const days=series.days.slice(-7), max=Math.max(1,...days.map(d=>d.qualified));
  const bars=[...Array(7-days.length).fill(null),...days];
  $('#dashBars').innerHTML=bars.map(d=>`<i style="height:${d?Math.max(6,d.qualified/max*100):6}%" title="${d?`${esc(d.day)}: ${d.qualified} qualified`:'no data'}"></i>`).join('');
  $('#dashLegendNote').textContent=sim?'includes simulation · model output':'live · last 7 days';
}
const refreshDashSafe=()=>refreshDash().catch(()=>{$('#dashLabel').textContent='OFFLINE'});
poll(refreshDashSafe);

// Public leaderboard — verified final-year sign-ups only.
async function refreshBoard(){
  try{
    const d=await api('leaderboard?limit=8');
    const rows=d.rows;
    $('#publicLeaderboard').innerHTML=rows.length?rows.map(r=>`<div class="leader-row"><span class="rank">${r.rank}</span><div><b>${esc(r.name)}${r.is_simulated?' <em class="sim-tag">SIM</em>':''}</b><small>${esc(r.college)}</small></div><span class="score">${r.verified}</span></div>`).join(''):'<div class="board-empty">No ambassadors yet. Sign up on the right to take the first spot.</div>';
    $('#boardStatus').textContent=`Updated ${new Date(d.updated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
    const foot=$('#boardFoot');foot.hidden=!d.includes_simulated;
    foot.innerHTML='<span class="sim-flag">Simulation</span> Rows tagged SIM are generated by the campaign model — model output from our assumptions, not campaign results.';
  }catch{$('#boardStatus').textContent='Reconnecting…'}
}
poll(refreshBoard);

// Ambassador open sign-up
function ambassadorLink(code){return `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}&src=${encodeURIComponent('Campus ambassador')}`}
async function renderAmbassador(){
  const me=store.get(AMB_KEY); $('#ambassadorForm').hidden=!!me; $('#ambResult').hidden=!me; if(!me)return;
  $('#ambLink').textContent=ambassadorLink(me.code);
  try{const d=await api(`ambassador-stats?code=${encodeURIComponent(me.code)}`);$('#ambVerified').textContent=d.ambassador.verified;$('#ambRank').textContent=`#${d.ambassador.rank}`}
  catch(x){if(x.status===404){store.del(AMB_KEY);renderAmbassador()}}
}
$('#ambassadorForm')?.addEventListener('submit',async e=>{
  e.preventDefault(); const form=e.currentTarget, err=$('#ambError'), btn=form.querySelector('button[type=submit]'); err.hidden=true;
  if(!form.reportValidity())return;
  btn.disabled=true;
  try{const d=await api('ambassador-signup',{method:'POST',body:Object.fromEntries(new FormData(form).entries())});store.set(AMB_KEY,{code:d.ambassador.code,first_name:d.ambassador.first_name});form.reset();renderAmbassador();refreshBoard()}
  catch(x){err.textContent=errorText(x);err.hidden=false}
  finally{btn.disabled=false}
});
$('#ambCopy')?.addEventListener('click',()=>copyWithFeedback($('#ambCopy'),$('#ambLink').textContent,'✓','⧉'));
$('#ambWhatsApp')?.addEventListener('click',()=>window.open(`https://wa.me/?text=${encodeURIComponent(`Free 60-minute AI project workshop for our 2027 batch — build one live project you can explain in interviews. Register here: ${$('#ambLink').textContent}`)}`,'_blank','noopener'));
$('#ambReset')?.addEventListener('click',()=>{store.del(AMB_KEY);renderAmbassador()});
renderAmbassador(); setInterval(()=>{if(!document.hidden&&store.get(AMB_KEY))renderAmbassador()},POLL_MS);
