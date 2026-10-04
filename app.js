const LS_KEY='waveloop_demo_v2';
const getState=()=>{try{return JSON.parse(localStorage.getItem(LS_KEY))||{registrations:[],referrals:[],messages:[],lastRef:null}}catch{return{registrations:[],referrals:[],messages:[],lastRef:null}}};
const setState=s=>localStorage.setItem(LS_KEY,JSON.stringify(s));
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function makeCode(name){const base=(name||'WAVE').replace(/[^a-z0-9]/gi,'').slice(0,5).toUpperCase()||'WAVE';return `${base}-${Math.random().toString(36).slice(2,7).toUpperCase()}`}
function parseTracking(){const p=new URLSearchParams(location.search);return{ref:p.get('ref')||'',src:p.get('src')||'Direct'}}

// Theme
const themeToggle=$('#themeToggle');
if(localStorage.getItem('waveloop_theme')==='dark')document.documentElement.dataset.theme='dark';
themeToggle?.addEventListener('click',()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.setItem('waveloop_theme',dark?'light':'dark')});

// Mobile menu
$('#mobileMenu')?.addEventListener('click',()=>{const n=$('.nav-links');const open=n.dataset.open==='1';n.dataset.open=open?'0':'1';n.style.display=open?'none':'flex';n.style.position='absolute';n.style.top='66px';n.style.right='4vw';n.style.flexDirection='column';n.style.padding='14px';n.style.border='1px solid var(--line)';n.style.background='var(--paper)';n.style.borderRadius='14px';n.style.boxShadow='var(--shadow)'});

// Register modal
const regDialog=$('#registerDialog'), successDialog=$('#successDialog'), registerForm=$('#registerForm');
$$('[data-open-register]').forEach(b=>b.addEventListener('click',()=>regDialog.showModal()));
$('#cancelRegister')?.addEventListener('click',()=>regDialog.close()); $('#closeSuccess')?.addEventListener('click',()=>successDialog.close()); $('#closeSuccess2')?.addEventListener('click',()=>successDialog.close());
const tracking=parseTracking(); if(tracking.ref) $('#referredByInput').value=tracking.ref;
function referralLink(code){return `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}&src=Referral`}
function shareMessage(link){return `I just registered for “Build Your First AI Project in 60 Minutes”. It’s a free, focused AI build session for final-year students. Join me: ${link}`}
function referralCount(code){const s=getState();return s.referrals.filter(r=>r.from===code).length}
function renderSuccess(code){const link=referralLink(code);$('#refLinkText').textContent=link;const count=referralCount(code);$('#successProgressText').textContent=`${Math.min(count,5)} / 5`;$('#successProgressBar').style.width=`${Math.max(0,Math.min(count/5*100,100))}%`;successDialog.showModal();}
registerForm?.addEventListener('submit',e=>{
  e.preventDefault();
  const data=Object.fromEntries(new FormData(registerForm).entries()); const s=getState();
  const email=data.email.trim().toLowerCase(); const existing=s.registrations.find(r=>r.email===email);
  if(existing){s.lastRef=existing.referralCode;setState(s);regDialog.close();renderSuccess(existing.referralCode);return}
  const code=makeCode(data.name); const createdAt=new Date().toISOString();
  const registration={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),...data,email,referralCode:code,referredBy:data.referredBy||tracking.ref||'',source:tracking.src!=='Direct'?tracking.src:(data.source||'Direct'),createdAt,qualified:data.year==='2027'};
  s.registrations.push(registration); if(registration.referredBy)s.referrals.push({from:registration.referredBy,to:code,createdAt,verified:registration.qualified}); s.lastRef=code;setState(s);regDialog.close();registerForm.reset();$('#referredByInput').value='';renderSuccess(code);renderReferralHub();
});
$('#copyRef')?.addEventListener('click',async()=>{const t=$('#refLinkText').textContent;try{await navigator.clipboard.writeText(t);$('#copyRef').textContent='✓'}catch{alert(t)}setTimeout(()=>$('#copyRef').textContent='⧉',1200)});
$('#shareWhatsApp')?.addEventListener('click',()=>{const link=$('#refLinkText').textContent;window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage(link))}`,'_blank','noopener')});
$('#copyShareText')?.addEventListener('click',async()=>{const link=$('#refLinkText').textContent;const text=shareMessage(link);try{await navigator.clipboard.writeText(text);$('#copyShareText').textContent='Copied ✓';setTimeout(()=>$('#copyShareText').textContent='Copy share message',1200)}catch{alert(text)}});
$('#goToHub')?.addEventListener('click',()=>{successDialog.close();document.querySelector('#growth')?.scrollIntoView({behavior:'smooth'});});

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
function showFitResult(){const map={productivity:['AI Study Copilot','Build a small assistant that turns notes into an action plan and explains the reasoning.'],career:['Interview Story Builder','Build a tool that turns a project outline into a concise demo script and interview-ready talking points.'],education:['Learning Coach','Create a focused tutor that converts a concept into examples, questions and a mini revision loop.'],content:['Portfolio Content Copilot','Build a utility that turns project notes into a polished README, LinkedIn draft and demo checklist.']};const [title,desc]=map[quiz.problem]||map.career;$('#fitModalResult').innerHTML=`<h3>${title}</h3><p>${desc}</p><div class="result-actions"><button class="btn btn-primary" id="fitRegister">Build this in the workshop →</button><button class="btn btn-secondary" id="fitClose">Keep exploring</button></div>`;$('#fitModalResult').classList.add('show');$('#fitRegister').addEventListener('click',()=>{fitDialog.close();regDialog.showModal()});$('#fitClose').addEventListener('click',()=>fitDialog.close())}

// Referral hub summary stored in browser; enrich page with a floating toast for repeat visits
function renderReferralHub(){const s=getState();if(!s.lastRef)return;const n=referralCount(s.lastRef);document.title=n?`WaveLoop · ${n} referral${n>1?'s':''}`:'WaveLoop · Build. Explain. Share.'}
renderReferralHub();

// Persistent student hub
function renderHub(){
  const s=getState(); const code=s.lastRef; const section=$('#myHub'), nav=$('#hubNav');
  if(!code){section.hidden=true; if(nav)nav.hidden=true; return}
  section.hidden=false; if(nav)nav.hidden=false;
  const link=referralLink(code), count=referralCount(code);
  $('#hubLink').textContent=link; $('#hubCount').textContent=Math.min(count,5); $('#hubBar').style.width=`${Math.min(count/5*100,100)}%`;
  const next=count<1?'1 referral':count<3?'3 referrals':count<5?'5 referrals':'All milestones unlocked';
  const reward=count<1?'Share your link once to start your reward ladder.':count<3?'Nice. One referral is verified — keep the loop moving.':count<5?'You have momentum. Push to the final referral tier.':'You reached the top referral tier in this demo.';
  $('#hubNext').textContent=next; $('#hubReward').textContent=reward;
}
$('#hubCopy')?.addEventListener('click',async()=>{const t=$('#hubLink').textContent;try{await navigator.clipboard.writeText(t);$('#hubCopy').textContent='✓';setTimeout(()=>$('#hubCopy').textContent='⧉',1000)}catch{alert(t)}});
$('#hubWhatsApp')?.addEventListener('click',()=>window.open(`https://wa.me/?text=${encodeURIComponent(shareMessage($('#hubLink').textContent))}`,'_blank','noopener'));
$('#hubCopyMsg')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(shareMessage($('#hubLink').textContent));$('#hubCopyMsg').textContent='Copied ✓';setTimeout(()=>$('#hubCopyMsg').textContent='Copy message',1000)}catch{alert(shareMessage($('#hubLink').textContent))}});
$('#hubRegisterAgain')?.addEventListener('click',()=>document.querySelector('#growth').scrollIntoView({behavior:'smooth'}));
renderHub();
