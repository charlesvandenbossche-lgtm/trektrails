// Old single-page links (#trek-…, #trails, #about) redirect to the real pages.
(function(){
  var h=location.hash.slice(1);
  if(location.pathname==='/'&&h){
    if(h.indexOf('trek-')===0){location.replace('/treks/'+h.slice(5)+'/');return}
    if(h==='trails'){location.replace('/treks/');return}
    if(h==='about'){location.replace('/about/');return}
  }
  // Home: season finder
  var box=document.getElementById('monthrows');
  if(box){
    var pick=new Date().getMonth()+1, rows=[].slice.call(box.querySelectorAll('.row')), empty=box.querySelector('.empty');
    var btns=[].slice.call(document.querySelectorAll('.months button'));
    var show=function(){
      var n=0;
      rows.forEach(function(r){var on=r.dataset.m.split(',').indexOf(String(pick))>-1;r.hidden=!on;if(on)n++});
      empty.hidden=n>0;
      btns.forEach(function(b){b.setAttribute('aria-pressed',String(+b.dataset.month===pick))});
    };
    btns.forEach(function(b){b.addEventListener('click',function(){pick=+b.dataset.month;show()})});
    show();
  }
  // All treks: filters and sorting
  var res=document.getElementById('results');
  if(res){
    var grid=res.querySelector('.grid'), cards=[].slice.call(grid.children), none=res.querySelector('.empty'), count=document.getElementById('count');
    var sel={}; [].forEach.call(document.querySelectorAll('select[data-f]'),function(s){sel[s.dataset.f]=s});
    var q=new URLSearchParams(location.search);
    ['region','topic','month','level','sleep'].forEach(function(k){if(q.get(k)&&sel[k])sel[k].value=q.get(k)});
    var apply=function(){
      var v={}; Object.keys(sel).forEach(function(k){v[k]=sel[k].value});
      var n=0;
      cards.forEach(function(c){
        var d=c.dataset, ok=(!v.region||d.region===v.region)&&(!v.level||d.level===v.level)&&(!v.sleep||d.st===v.sleep)&&(!v.month||d.months.split(',').indexOf(v.month)>-1)&&(!v.topic||d.tags.split(',').indexOf(v.topic)>-1);
        c.hidden=!ok; if(ok)n++;
      });
      var s=v.sort||'name';
      cards.slice().sort(function(a,b){var x=a.dataset,y=b.dataset;return s==='km'?y.km-x.km:s==='days'?x.days-y.days:s==='level'?x.level-y.level:x.name.localeCompare(y.name)}).forEach(function(c){grid.appendChild(c)});
      none.hidden=n>0; count.textContent=n+' of '+cards.length+' treks';
    };
    Object.keys(sel).forEach(function(k){sel[k].addEventListener('change',apply)});
    var reset=document.getElementById('reset');
    if(reset)reset.addEventListener('click',function(){Object.keys(sel).forEach(function(k){sel[k].value=k==='sort'?'name':''});apply()});
    apply();
  }
})();
