// Command center: everything comes from /api/admin-overview (polled every 12 s) behind the admin passcode.
const TOKEN_KEY='waveloop_admin_token', SCOPE_KEY='waveloop_admin_scope', POLL_MS=12000, TARGET=500;
const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const session={get(k){try{return sessionStorage.getItem(k)}catch{return null}},set(k,v){try{sessionStorage.setItem(k,v)}catch{}},del(k){try{sessionStorage.removeItem(k)}catch{}}};
const CHANNEL_LABEL={ambassador:'Campus ambassador',referral:'Referral loop',community:'Placement community',social:'Social / creator',direct:'Direct'};
const fmt=n=>Number(n||0).toLocaleString('en-IN');
const simTag=on=>on?' <em class="sim-tag">SIM</em>':'';

let scope=session.get(SCOPE_KEY)||'all', overview=null, timer=null, animating=false;

// Theme (shared preference with the landing page)
if(localStorage.getItem('waveloop_theme')==='dark')document.documentElement.dataset.theme='dark';
$('#themeToggle').addEventListener('click',()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.setItem('waveloop_theme',dark?'light':'dark')});

async function api(path,{method='GET',body}={}){
  const headers={};const token=session.get(TOKEN_KEY);
  if(token)headers.Authorization=`Bearer ${token}`;
  if(body)headers['Content-Type']='application/json';
  let res,data;
  try{res=await fetch(`/api/${path}`,{method,headers,body:body?JSON.stringify(body):undefined});data=await res.json()}
  catch{throw Object.assign(new Error('Could not reach the API.'),{code:'network'})}
  if(res.status===401&&path!=='admin-login'){lock('Your session expired. Enter the passcode again.')}
  if(!res.ok||!data.ok){const e=data?.error||{};throw Object.assign(new Error(e.message||'Request failed.'),{code:e.code,fields:e.fields,status:res.status})}
  return data;
}

// ── Passcode gate ──
function lock(message){session.del(TOKEN_KEY);document.body.classList.add('locked');$('#logout').hidden=true;clearTimeout(timer);if(message){$('#loginError').textContent=message;$('#loginError').hidden=false}}
function unlock(){document.body.classList.remove('locked');$('#logout').hidden=false;$('#loginError').hidden=true;refresh();loadSimStatus()}
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;$('#loginError').hidden=true;
  try{const d=await api('admin-login',{method:'POST',body:{passcode:$('#passcode').value}});session.set(TOKEN_KEY,d.token);$('#passcode').value='';unlock()}
  catch(x){$('#loginError').textContent=x.message;$('#loginError').hidden=false}
  finally{btn.disabled=false}
});
$('#logout').addEventListener('click',()=>lock());

// ── Scope switch ──
function paintScope(){$$('#scopeSwitch button').forEach(b=>b.classList.toggle('active',b.dataset.scope===scope))}
$$('#scopeSwitch button').forEach(b=>b.addEventListener('click',()=>{scope=b.dataset.scope;session.set(SCOPE_KEY,scope);paintScope();refresh()}));
paintScope();

// ── Polling ──
async function refresh(){
  clearTimeout(timer);
  if(!session.get(TOKEN_KEY))return;
  if(!document.hidden){try{overview=await api(`admin-overview?scope=${scope}&recent=50`);render()}catch(x){if(x.status!==401)$('#boardUpdated').textContent='reconnecting…'}}
  if(session.get(TOKEN_KEY))timer=setTimeout(refresh,POLL_MS);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});

function render(){
  const o=overview, s=o.stats, sim=s.includes_simulated;
  $('#simBanner').hidden=!sim;
  $('#dataBadge').textContent=sim?(s.real_rows&&scope==='all'?'Live data + simulation':'Simulation data'):'Live data';
  $('#dataBadge').classList.toggle('badge-sim',sim);
  $('#kpiRegs').textContent=fmt(s.total);
  $('#kpiRegsNote').textContent=sim?`incl. ${fmt(s.simulated_rows)} simulated`:'all sign-ups';
  $('#kpiQualified').textContent=fmt(s.qualified);
  $('#kpiQualifiedNote').textContent=`of ${TARGET} target · ${Math.round(s.qualified/TARGET*100)}%`;
  $('#kpiQualifiedBar').style.width=`${Math.min(100,s.qualified/TARGET*100)}%`;
  $('#kpiReferrals').textContent=fmt(s.verified_referrals);
  $('#kpiReferralsNote').textContent=`of ${fmt(s.referral_events)} referral events`;
  $('#kpiAmbassadors').textContent=fmt(s.ambassadors);
  $('#boardUpdated').textContent=`updated ${new Date(o.generated_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})}`;
  renderLeaders(o.ambassadors);renderChannels(o.channels);renderFeed(o.recent);renderTable(o.recent);renderAmbassadors(o.ambassadors);
  if(!animating)renderChart(o.daily.days);
  renderSimSummary();
}

function renderLeaders(rows){
  $('#leaderboard').innerHTML=rows.slice(0,8).map(r=>`<div class="leader-row"><span class="rank">${r.rank}</span><div><b>${esc(r.name)}${simTag(r.is_simulated)}</b><small>${r.verified} verified final-year sign-up${r.verified===1?'':'s'}</small></div><span class="score">${r.verified}</span></div>`).join('')||'<div class="empty">No ambassadors yet. Share the landing page’s ambassador sign-up.</div>';
}

function renderChannels(c){
  const max=Math.max(1,...c.channels.map(x=>x.qualified));
  $('#channels').innerHTML=c.channels.map(x=>`<div class="channel-row"><span>${esc(x.label)}</span><div class="track"><div class="fill" style="width:${x.qualified/max*100}%"></div></div><b>${fmt(x.qualified)} <small>/ ${fmt(x.total)}</small></b></div>`).join('')+
    `<div class="channel-row" style="margin-top:7px"><span><strong>Total</strong>${c.includes_simulated?' <em class="sim-tag">SIM</em>':''}</span><div></div><b>${fmt(c.qualified)} <small>/ ${fmt(c.total)}</small></b></div>`;
  const top=[...c.channels].sort((a,b)=>b.qualified-a.qualified)[0];
  $('#budgetRecommendation').textContent=c.qualified<50?'Collect more data':`Back ${top.label.toLowerCase()} (${Math.round(top.qualified_share*100)}% of qualified)`;
}

function timeAgo(iso){const m=Math.round((Date.now()-new Date(iso))/60000);if(m<1)return'just now';if(m<60)return`${m} min ago`;const h=Math.round(m/60);if(h<24)return`${h} h ago`;const d=Math.round(h/24);return`${d} day${d>1?'s':''} ago`}
function renderFeed(rows){
  $('#feed').innerHTML=rows.slice(0,8).map(r=>`<div class="feed-row"><span class="feed-dot ${r.is_qualified?'q':''}"></span><div><b>${esc(r.name.split(' ').slice(0,2).join(' '))}${simTag(r.is_simulated)}</b><small>${esc(r.college)} · ${esc(r.branch)} · ${esc(CHANNEL_LABEL[r.channel])}</small></div><time datetime="${esc(r.created_at)}">${timeAgo(r.created_at)}</time></div>`).join('')||'<div class="empty">No sign-ups yet.</div>';
}

const when=iso=>new Date(iso).toLocaleString([], {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
function renderTable(rows){
  $('#regTable').innerHTML=rows.map(r=>`<tr><td>${when(r.created_at)}</td><td>${esc(r.name)}${simTag(r.is_simulated)}</td><td>${esc(r.college)}</td><td>${esc(r.branch)}</td><td>${esc(r.graduation_year??'Other')}</td><td>${esc(CHANNEL_LABEL[r.channel])}</td><td>${esc(r.referred_by_code||'—')}</td><td class="${r.is_qualified?'qual':'nq'}">${r.is_qualified?'Yes':'No'}</td></tr>`).join('')||'<tr><td colspan="8">No registrations yet.</td></tr>';
}
function renderAmbassadors(rows){
  $('#ambTable').innerHTML=rows.map(r=>`<tr><td>${r.rank}</td><td>${esc(r.name)}${simTag(r.is_simulated)}</td><td>${esc(r.college)}</td><td>${esc(r.email)}</td><td><code>${esc(r.code)}</code></td><td class="qual">${r.verified}</td><td>${r.not_qualified}</td><td>${r.last_signup_at?when(r.last_signup_at):'—'}</td></tr>`).join('')||'<tr><td colspan="8">No ambassadors yet.</td></tr>';
}

// ── Daily cumulative chart ──
function renderChart(days,upto=days.length-1){
  const shown=days.slice(-14), offset=days.length-shown.length;
  const max=Math.max(TARGET,...shown.map(d=>d.cum_total))*1.08;
  const h=v=>`${v/max*100}%`;
  $('#chartFlag').innerHTML=overview?.daily.includes_simulated?'<span class="sim-flag">Simulation</span>':'';
  if(!shown.length){$('#simChart').innerHTML='<div class="empty chart-empty">No sign-ups yet. Run the 7-day simulation or register on the landing page.</div>';return}
  $('#simChart').innerHTML=shown.map((d,i)=>{
    const on=i+offset<=upto, date=new Date(`${d.day}T00:00:00`);
    return `<div class="bar-col" title="${esc(d.day)}: ${d.cum_qualified} qualified / ${d.cum_total} total (cumulative)"><b>${on?fmt(d.cum_qualified):'—'}</b><div class="bar-stack"><i class="target-line" style="bottom:${h(TARGET)}">${i===shown.length-1?`<span>${TARGET} target</span>`:''}</i><div class="bar total" style="height:${on?h(d.cum_total):'0%'}"></div><div class="bar" style="height:${on?h(d.cum_qualified):'0%'}"></div></div><span>${date.toLocaleDateString([], {day:'numeric',month:'short'})}</span></div>`;
  }).join('');
}
function animateChart(){
  const days=overview?.daily.days||[];if(!days.length)return;
  animating=true;let i=Math.max(0,days.length-14);renderChart(days,i-1);
  const step=()=>{renderChart(days,i);i++;if(i<days.length)setTimeout(step,420);else animating=false};setTimeout(step,200);
}
$('#animateSim').addEventListener('click',animateChart);

// ── Simulation ──
let simStatus=null;
async function loadSimStatus(){try{simStatus=await api('simulate-run');renderSimSummary()}catch{}}
function renderSimSummary(){
  const t=simStatus?.totals;const has=t&&t.total>0;
  $('#simQualified').textContent=has?fmt(t.qualified):'—';
  $('#simTotal').textContent=has?fmt(t.total):'—';
  const run=simStatus?.run;
  $('#simNote').innerHTML=`<span class="sim-flag">Simulation</span>Model output from our assumptions, not campaign results.`+(has&&run?` Seeded ${esc(run.window_start)} → ${esc(run.window_end)} (IST); qualified by channel: ambassadors ${t.qualified_by_channel.ambassador??0}, referral loop ${t.qualified_by_channel.referral??0}, placement communities ${t.qualified_by_channel.community??0}, social/creator ${t.qualified_by_channel.social??0}, direct ${t.qualified_by_channel.direct??0}.`:' Run the simulation to seed 7 days of generic, flagged rows ending yesterday.');
}
$('#runSim').addEventListener('click',async()=>{
  const btn=$('#runSim');btn.disabled=true;btn.textContent='Seeding…';
  try{simStatus=await api('simulate-run',{method:'POST',body:{action:'run'}});await refresh();animateChart()}
  catch(x){alert(x.message)}
  finally{btn.disabled=false;btn.textContent='Run 7-day simulation'}
});
$('#resetSim').addEventListener('click',async()=>{
  if(!confirm('Delete every simulated row (is_simulated = true)? Real registrations are kept.'))return;
  try{await api('simulate-run',{method:'POST',body:{action:'reset'}});await loadSimStatus();refresh()}catch(x){alert(x.message)}
});

// ── Message lab ──
// Last-resort copies if the API itself is unreachable; the server has richer templates and the LLM.
const msgTemplates={en:{direct:'Free 60-minute AI project workshop for final-year students. Build one live project you can explain in an interview. I’m registered — join me here: [your referral link]',peer:'I’m joining a free 60-minute AI build workshop for 2027 batch students. Want to build together? Here’s my link: [your referral link]',urgency:'24 hours left to grab a spot for a free 60-minute AI project build session. Come with a friend and leave with something you can explain: [your referral link]'},ta:{direct:'2027 batch மாணவர்களுக்கு free 60-minute AI project workshop. Interview-ல் explain செய்யக்கூடிய ஒரு live project build பண்ணலாம். Join: [your referral link]',peer:'நான் ஒரு free 60-minute AI build workshop-க்கு register பண்ணிட்டேன். நாம friends-ஆ சேர்ந்து build பண்ணலாமா? [your referral link]',urgency:'24 hours left! 60-minute AI project workshop-க்கு ஒரு friend-ஐ கூட அழைத்துக் கொண்டு join பண்ணலாம்: [your referral link]'},te:{direct:'2027 batch students కోసం free 60-minute AI project workshop. Interviewలో explain చేయగల live project build చేద్దాం. Join: [your referral link]',peer:'నేను free 60-minute AI build workshopకి register అయ్యాను. కలిసి build చేద్దామా? నా link: [your referral link]',urgency:'24 hours left! ఒక friendతో కలిసి free 60-minute AI project workshopలో join అవ్వండి: [your referral link]'}};
$('#generate').addEventListener('click',async()=>{
  const btn=$('#generate'), err=$('#copyError');err.hidden=true;btn.disabled=true;btn.textContent='Writing…';
  const body={language:$('#lang').value,tone:$('#messageTone').value,channel:$('#messageChannel').value,college:$('#msgCollege').value,ambassador_name:$('#msgAmbassador').value};
  try{
    const d=await api('copy-generate',{method:'POST',body});
    $('#messageOut').value=d.message;
    $('#copySource').textContent=d.source==='llm'?`AI draft · ${d.model}`:`Template · ${d.fallback_reason}`;
  }catch(x){
    if(x.code==='network'){$('#messageOut').value=msgTemplates[body.language][body.tone];$('#copySource').textContent='Offline template'}
    else{err.textContent=x.fields?Object.values(x.fields).join(' '):x.message;err.hidden=false}
  }finally{btn.disabled=false;btn.textContent='Generate message'}
});
$('#copyMessage').addEventListener('click',async()=>{const t=$('#messageOut').value;if(!t)return;try{await navigator.clipboard.writeText(t);$('#copyMessage').textContent='Copied ✓';setTimeout(()=>$('#copyMessage').textContent='Copy message',1200)}catch{alert(t)}});
$('#waMessage').addEventListener('click',()=>{const t=$('#messageOut').value;if(t)window.open(`https://wa.me/?text=${encodeURIComponent(t)}`,'_blank','noopener')});

// ── CSV export of the loaded sign-ups ──
$('#exportCsv').addEventListener('click',()=>{const rows=overview?.recent||[];if(!rows.length){alert('No registrations to export.');return}const headers=['created_at','name','email','college','branch','graduation_year','goal','channel','referral_source','referred_by_code','own_referral_code','is_qualified','is_simulated'];const csv=[headers.join(','),...rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(','))].join('\n');const blob=new Blob([csv],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`waveloop-signups-${scope}.csv`;a.click();URL.revokeObjectURL(a.href)});

if(session.get(TOKEN_KEY))unlock();
