import {M,MONTHS,LEVELS,REGIONS,TOPICS,SLEEP,T,NOTES,NEXT} from '../data/treks.mjs';
const state={region:'',level:'',month:'',topic:'',sleep:'',sort:'name'};
const bySlug=s=>T.find(t=>t.slug===s);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const season=t=>'<div class="season" role="img" aria-label="In season: '+t.months.map(m=>MONTHS[m-1]).join(', ')+'">'+M.map((m,i)=>'<i class="'+(t.months.includes(i+1)?'on':'')+'">'+m+'</i>').join('')+'</div>';
const card=(t,big)=>'<a class="card'+(big?' big':'')+'" href="/treks/'+t.slug+'/" data-region="'+t.region+'" data-level="'+t.level+'" data-months="'+t.months.join(',')+'" data-tags="'+t.tags.join(',')+'" data-st="'+t.st+'" data-km="'+t.km+'" data-days="'+t.days+'" data-name="'+esc(t.name)+'"><div class="ph"><img src="/img/'+t.img+'.jpg" alt="'+esc(t.name)+', '+esc(t.where)+'" loading="lazy"><span class="lvl tt-badge tt-badge--dark">'+LEVELS[t.level]+'</span></div><div class="tx"><span class="where">'+esc(t.where)+'</span><h3>'+esc(t.name)+'</h3>'+(big?'<p>'+esc(t.blurb)+'</p>':'')+season(t)+'<div class="facts num"><span class="tt-badge tt-badge--forest">'+t.days+' days</span><span class="tt-badge tt-badge--dark">'+t.km+' km</span>'+(t.up?'<span class="tt-badge tt-badge--outline">+'+t.up.toLocaleString('en')+' m</span>':'<span class="tt-badge tt-badge--outline">'+esc(SLEEP[t.st])+'</span>')+'</div></div></a>';
const row=t=>'<a class="row" href="/treks/'+t.slug+'/" data-m="'+t.months.join(',')+'"><img src="/img/'+t.img+'.jpg" alt="" loading="lazy"><div><h3>'+esc(t.name)+'</h3><span class="num">'+esc(t.where)+' · '+t.days+' days · '+t.km+' km'+(t.up?' · +'+t.up.toLocaleString('en')+' m':'')+' · '+LEVELS[t.level]+'</span></div><span class="go" aria-hidden="true">→</span></a>';
const opt=(v,l,cur)=>'<option value="'+v+'"'+(String(cur)===String(v)?' selected':'')+'>'+esc(l)+'</option>';
function home(){
  const km=T.reduce((a,t)=>a+t.km,0), countries=21;
  const f=[bySlug('ak-suu-traverse'),bySlug('tour-du-mont-blanc'),bySlug('laugavegur')];
  return `
<div class="hero">
  <img src="/img/kyrgyzstan.jpg" alt="Two hikers climbing a grass slope below a glacier in the Tian Shan, Kyrgyzstan">
  <div class="inner"><div class="wrap"><div class="panel">
    <h1>See the world on foot</h1>
    <p>A growing field guide to the most famous and most beautiful multi-day treks on earth. Honest figures, real seasons and enough detail to decide which one is yours.</p>
    <div class="cta"><a class="btn solid" href="/treks/">Browse all ${T.length} treks</a><a class="btn" href="/about/">What this site is for</a></div>
  </div></div></div>
</div>
<svg class="horizon" viewBox="0 0 600 96" preserveAspectRatio="none" aria-hidden="true"><rect class="b1" width="600" height="96"/><path class="b2" d="M0 18 C150 10 300 24 450 16 S600 14 600 14 V96 H0Z"/><path class="b3" d="M0 36 C140 30 320 42 460 34 S600 32 600 32 V96 H0Z"/><path class="b4" d="M0 52 C160 46 300 58 440 50 S600 50 600 50 V96 H0Z"/><path class="b5" d="M0 66 C150 60 310 72 450 64 S600 64 600 64 V96 H0Z"/><path class="b6" d="M0 82 C140 76 300 88 460 80 S600 80 600 80 V96 H0Z"/></svg>
<div class="tally"><div class="wrap num">
  <div><b>${T.length}</b><span>treks described so far</span></div>
  <div><b>${countries}</b><span>countries crossed</span></div>
  <div><b>${km.toLocaleString('en')}</b><span>kilometres of trail</span></div>
  <div><b>5,895</b><span>metres at the highest point</span></div>
</div></div>

<section><div class="wrap purpose">
  <p class="lead">Some places only make sense at walking speed. Trek Trails collects the world's great long walks in one place and describes each of them the same way, so you can <em>compare, choose and go</em>.</p>
  <ul class="promises">
    <li><img class="mark" src="/img/mark.png" alt="" aria-hidden="true"><div><h3>Same facts for every trek</h3><p>Days, distance, sleeping, level and season in one fixed sheet, so a week in Iceland can sit next to a week in Jordan.</p></div></li>
    <li><img class="mark" src="/img/mark.png" alt="" aria-hidden="true"><div><h3>Who it suits and who it doesn't</h3><p>Every trek says plainly who will love it and who should pick something else.</p></div></li>
    <li><img class="mark" src="/img/mark.png" alt="" aria-hidden="true"><div><h3>Written to get you outside</h3><p>The goal is simple: more people discovering the world on their own two feet.</p></div></li>
  </ul>
</div></section>

<section><div class="wrap">
  <div class="sechead"><div><span class="label">Start here</span><h2>Three treks worth a year of planning</h2></div><a class="more" href="/treks/">All treks</a></div>
  <div class="feature">${card(f[0],true)}<div class="side">${card(f[1])}${card(f[2])}</div></div>
</div></section>

<section><div class="wrap">
  <div class="sechead"><div><span class="label">Season finder</span><h2>Where to walk, month by month</h2></div><p>Pick a month to see which treks are in season. The green cells on every trek show the same thing.</p></div>
  <div class="months" role="group" aria-label="Choose a month">${MONTHS.map((m,i)=>'<button type="button" data-month="'+(i+1)+'" aria-pressed="false">'+m.slice(0,3)+'</button>').join('')}</div>
  <div id="monthrows"><div class="rows">${T.map(row).join('')}</div><p class="empty" hidden>Nothing in season this month yet. More southern-hemisphere and desert treks are on the list.</p></div>
</div></section>

<section><div class="wrap">
  <div class="sechead"><div><span class="label">Destinations</span><h2>Browse by region</h2></div></div>
  <div class="regions">${Object.entries(REGIONS).map(([k,r])=>{const n=T.filter(t=>t.region===k).length;return '<a class="region" href="/treks/?region='+k+'"><img src="/img/'+r.img+'.jpg" alt="" loading="lazy"><div><h3>'+esc(r.name)+'</h3><span class="num">'+n+' trek'+(n===1?'':'s')+'</span></div></a>'}).join('')}</div>
</div></section>

<section><div class="wrap">
  <div class="sechead"><div><span class="label">Topics</span><h2>Or start from what you want</h2></div></div>
  <div class="topics">${Object.entries(TOPICS).map(([k,v])=>'<a href="/treks/?topic='+k+'">'+esc(v.name)+'<small>'+esc(v.note)+'</small></a>').join('')}</div>
</div></section>

<section><div class="wrap two">
  <div>
    <span class="label">Field notes</span><h2>Planning guides</h2>
    <ul class="list">${NOTES.map(n=>'<li><div><b>'+esc(n[0])+'</b><small>'+esc(n[1])+'</small></div><span class="tag">In the works</span></li>').join('')}</ul>
  </div>
  <div>
    <span class="label">On the list</span><h2>Treks we describe next</h2>
    <ul class="list">${NEXT.map(n=>'<li><div><b>'+esc(n[0])+'</b></div><span class="tag">'+esc(n[1])+'</span></li>').join('')}</ul>
  </div>
</div></section>`;
}
function trails(){
  return `
<div class="wrap">
  <div class="pagehead"><span class="label">The collection</span><h1>All treks</h1><p>Every trek on the site, described with the same fact sheet. Filter by where, when and how hard, or scroll down for the full season calendar.</p></div>
  <div class="filters">
    <label for="f-region">Region<select id="f-region" data-f="region">${opt('','Anywhere',state.region)}${Object.entries(REGIONS).map(([k,r])=>opt(k,r.name,state.region)).join('')}</select></label>
    <label for="f-month">In season<select id="f-month" data-f="month">${opt('','Any month',state.month)}${MONTHS.map((m,i)=>opt(i+1,m,state.month)).join('')}</select></label>
    <label for="f-level">Level<select id="f-level" data-f="level">${opt('','Any level',state.level)}${[1,2,3,4,5].map(i=>opt(i,LEVELS[i],state.level)).join('')}</select></label>
    <label for="f-sleep">Sleeping<select id="f-sleep" data-f="sleep">${opt('','Any',state.sleep)}${Object.entries(SLEEP).map(([k,v])=>opt(k,v,state.sleep)).join('')}</select></label>
    <label for="f-topic">Topic<select id="f-topic" data-f="topic">${opt('','Any topic',state.topic)}${Object.entries(TOPICS).map(([k,v])=>opt(k,v.name,state.topic)).join('')}</select></label>
    <label for="f-sort">Sort by<select id="f-sort" data-f="sort">${opt('name','Name',state.sort)}${opt('km','Longest first',state.sort)}${opt('days','Fewest days first',state.sort)}${opt('level','Easiest first',state.sort)}</select></label>
    <button type="button" class="reset" id="reset">Clear filters</button>
    <span class="count num" id="count">${T.length} of ${T.length} treks</span>
  </div>
  <div id="results"><div class="grid">${[...T].sort((a,b)=>a.name.localeCompare(b.name)).map(t=>card(t)).join('')}</div><p class="empty" hidden>No trek matches all of these filters. Clear one of them to see more.</p></div>
  <section style="border-top:0">
    <div class="sechead"><div><span class="label">At a glance</span><h2>Season calendar</h2></div><p>Green marks the months with dependable conditions. Outside them, expect snow, heat or closed huts.</p></div>
    <div class="tablewrap"><table class="cal">
      <thead><tr><th scope="col">Trek</th>${MONTHS.map(m=>'<th scope="col">'+m.slice(0,3)+'</th>').join('')}</tr></thead>
      <tbody>${[...T].sort((a,b)=>a.months[0]-b.months[0]).map(t=>'<tr><td><a href="/treks/'+t.slug+'/">'+esc(t.name)+'</a></td>'+MONTHS.map((m,i)=>'<td class="m'+(t.months.includes(i+1)?' on':'')+'"><i title="'+m+(t.months.includes(i+1)?': in season':'')+'"></i></td>').join('')+'</tr>').join('')}</tbody>
    </table></div>
  </section>
</div>`;
}
function detail(t){
  const i=T.indexOf(t), p=T[(i-1+T.length)%T.length], n=T[(i+1)%T.length];
  const n0=v=>v==null?'–':v.toLocaleString('en');
  const sec=(h,x)=>x?'<h3>'+h+'</h3><p>'+esc(x)+'</p>':'';
  return `
<div class="dhero"><img src="/img/${t.img}.jpg" alt="${esc(t.name)}, ${esc(t.where)}"><div class="inner"><div class="wrap"><div class="panel"><span class="label">${esc(t.where)}</span><h1>${esc(t.name)}</h1><p class="sub">${esc(t.sub)}</p></div></div></div></div>
<div class="wrap">
  <ol class="crumbs"><li><a href="/">Home</a></li><li aria-hidden="true">/</li><li><a href="/treks/">All treks</a></li><li aria-hidden="true">/</li><li>${esc(t.name)}</li></ol>
  <dl class="sheet num">
    <div><dt>Days on trail</dt><dd>${t.days}</dd></div>
    <div><dt>Allow in total</dt><dd>${esc(t.trip)}</dd></div>
    <div><dt>Distance</dt><dd>${t.km} km</dd></div>
    <div><dt>${t.up?'Total climb':'Longest day'}</dt><dd>${t.up?'+'+n0(t.up)+' m':Math.max(...t.stages.map(g=>g[1]||0))+' km'}</dd></div>
    <div><dt>Level</dt><dd><span class="pips" aria-hidden="true">${[1,2,3,4,5].map(x=>'<i class="'+(x<=t.level?'on':'')+'"></i>').join('')}</span>${LEVELS[t.level]}</dd></div>
    <div><dt>${t.high?'Highest point':'Average per day'}</dt><dd>${t.high?esc(t.high):Math.round(t.km/t.days)+' km'}</dd></div>
    <div><dt>Sleeping</dt><dd class="small">${esc(t.sleep)}</dd></div>
    <div><dt>Region</dt><dd class="small">${esc(REGIONS[t.region].name)}</dd></div>
  </dl>
  <div class="dbody">
    <article>
      <h2>The trek</h2>
      ${t.intro.map((x,k)=>'<p class="'+(k?'para':'ov')+'">'+esc(x)+'</p>').join('')}
      <div class="fit">
        <div><h3>Made for</h3><p>${esc(t.yes)}</p></div>
        <div><h3>Think twice</h3><p>${esc(t.no)}</p></div>
      </div>
      <h2>Highlights</h2>
      <ul class="hl">${t.hl.map(x=>'<li><img class="mark" src="/img/mark.png" alt="" aria-hidden="true"><span>'+esc(x)+'</span></li>').join('')}</ul>
      ${t.gal.length?`<div class="gallery g${t.gal.length}">${t.gal.map(g=>'<img src="/img/'+g[0]+'.jpg" alt="'+esc(g[1])+'" loading="lazy">').join('')}</div>`:''}
      <h2>Stage by stage</h2>
      <div class="tablewrap"><table class="stages num">
        <thead><tr><th scope="col">Day</th><th scope="col">Stage</th><th scope="col">Km</th><th scope="col">Up</th><th scope="col">Down</th><th scope="col">Time</th></tr></thead>
        <tbody>${t.stages.map((g,k)=>'<tr><td>'+(k+1)+'</td><td><b>'+esc(g[0])+'</b><small>'+esc(g[5])+'</small></td><td>'+(g[1]==null?'–':g[1])+'</td><td>'+(g[2]==null?'–':'+'+n0(g[2])+' m')+'</td><td>'+(g[3]==null?'–':'−'+n0(g[3])+' m')+'</td><td>'+esc(g[4])+'</td></tr>').join('')}</tbody>
      </table></div>
      <h2>Good to know</h2>
      <div class="know">
        ${sec('How hard is it?',t.hard)}${sec('Where you sleep and eat',t.nights)}${sec('Getting there',t.getting)}${sec('When to go',t.when)}${sec('What to bring',t.pack)}
      </div>
      <h2>How to book it</h2>
      <div class="know"><h3>On your own</h3><p>${esc(t.diy)}</p></div>
      ${t.book?`      <div class="bookbox">
        <span class="label">Without the hassle</span>
        <p>If you would rather walk than organise, <b>${esc(t.book.name)}</b> ${esc(t.book.line)}. Prices start from about ${esc(t.book.from)} per person.</p>
        <a class="btn solid" href="${t.book.url}" target="_blank" rel="noopener">See ${esc(t.book.name)}</a>
      </div>`:`<div class="know"><h3>With an organiser</h3><p>${esc(t.org)}</p></div>`}
    </article>
    <aside>
      <div class="box"><h3>When to go</h3>${season(t)}<p class="cap">${t.months.map(m=>MONTHS[m-1]).join(', ')}</p></div>
      <div class="box"><h3>In short</h3><ul class="todo">
        <li><span>Longest day</span><b>${Math.max(...t.stages.map(g=>g[1]||0))} km</b></li>
        <li><span>Biggest climb</span><b>+${n0(Math.max(...t.stages.map(g=>g[2]||0)))} m</b></li>
        <li><span>Nights</span><b>${esc(SLEEP[t.st])}</b></li>
        ${t.book?'<li><span>Organised from</span><b>'+esc(t.book.from)+'</b></li>':''}
      </ul></div>
      <div class="box"><h3>Still to come</h3><ul class="todo">${['Elevation profile per stage','GPX download','Weather by week'].map(b=>'<li><span>'+b+'</span><span class="tag">Planned</span></li>').join('')}</ul></div>
    </aside>
  </div>
  <nav class="pn" aria-label="More treks"><a href="/treks/${p.slug}/"><span class="label">Previous</span><b>${esc(p.name)}</b></a><a href="/treks/${n.slug}/"><span class="label">Next</span><b>${esc(n.name)}</b></a></nav>
</div>`;
}
function about(){
  return `
<div class="wrap">
  <div class="pagehead"><span class="label">About</span><h1>Why Trek Trails exists</h1></div>
  <div class="prose">
    <p>The best way to understand a country is to cross a piece of it on foot. You notice the gradient, the weather, what people grow and what they cook. A week of walking stays with you longer than a month of driving.</p>
    <p>Trek Trails wants to be the most complete guide to the world's famous and beautiful multi-day treks. It starts with ${T.length} routes and grows from there, one carefully checked trek at a time.</p>
    <h2>How each trek is described</h2>
    <p>Every page opens with the same fact sheet: days on trail, total time to allow, distance, sleeping, level, highest point and season. Below that comes a plain verdict on who the trek suits. Then come the stages day by day, what the nights are like, how to get there, and how to book it, alone or organised.</p>
    <h2>The level scale</h2>
    <ul class="scale">${[1,2,3,4,5].map(i=>'<li><span class="pips" aria-hidden="true">'+[1,2,3,4,5].map(x=>'<i class="'+(x<=i?'on':'')+'"></i>').join('')+'</span><b>'+LEVELS[i]+'</b> · '+['good paths, short days, little climbing','a full week on foot, moderate climbs','mountain passes or rough ground most days','long days with big ascents, some exposure','extreme altitude or cold on top of long days'][i-1]+'</li>').join('')}</ul>
    <p style="color:var(--muted);font-size:14px;line-height:20px">Levels are an editorial estimate, not an official grading. Distances are rounded.</p>
    <h2>Who is behind it</h2>
    <p>Trek Trails is a personal project. Every trek is described for people who want to arrange it themselves, with a pointer to an organised version for those who would rather not.</p>
    <h2>What comes next</h2>
    <p>More treks outside Europe, planning guides and translations. If a famous route is missing, it is probably already on the list.</p>
    <p><a class="btn solid" href="/treks/">Browse the treks</a></p>
  </div>
</div>`;
}

export {home,trails,detail,about,esc};
