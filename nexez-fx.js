/* NEXEZ fx layer — pair with nexez-design-system.css */
function flip(){const h=document.documentElement;h.dataset.theme=h.dataset.theme==="light"?"dark":"light"}
(function(){
"use strict";
/* 1 · cursor-tracked specular — works in both themes, even with reduced motion (static light) */
addEventListener("pointermove",function(e){
  var t=e.target&&e.target.closest?e.target.closest(".btn,.glass.lift"):null;
  if(!t)return;
  var r=t.getBoundingClientRect();
  t.style.setProperty("--mx",((e.clientX-r.left)/r.width*100)+"%");
  t.style.setProperty("--my",((e.clientY-r.top)/r.height*100)+"%");
},{passive:true});

/* mobile menu — clones nav links into a glass sheet, on every page automatically */
var nav=document.querySelector("nav.glassnav");
if(nav){var links=nav.querySelector(".navlinks");
  if(links){
    var right=nav.lastElementChild;
    var mb=document.createElement("button");
    mb.className="btn btn-ghost btn-sm menu-btn";mb.type="button";
    mb.setAttribute("aria-label","Open menu");mb.setAttribute("aria-expanded","false");
    mb.setAttribute("aria-controls","nav-sheet");mb.textContent="\u2630";
    right.insertBefore(mb,right.firstChild);
    var sheet=document.createElement("div");sheet.className="navsheet";sheet.id="nav-sheet";
    links.querySelectorAll("a").forEach(function(a){sheet.appendChild(a.cloneNode(true))});
    /* fold the ghost actions (e.g. Sign in, hidden in the bar <=480px) into the
       sheet so they stay reachable; strip btn classes -> plain sheet links */
    var ghosts=right.querySelectorAll("a.btn-ghost");
    if(ghosts.length){var hr=document.createElement("hr");hr.className="hair";sheet.appendChild(hr);
      ghosts.forEach(function(a){var c=a.cloneNode(true);c.className="";sheet.appendChild(c)});}
    nav.appendChild(sheet);
    var close=function(){nav.classList.remove("open");mb.setAttribute("aria-expanded","false")};
    mb.addEventListener("click",function(e){e.stopPropagation();
      var open=nav.classList.toggle("open");mb.setAttribute("aria-expanded",String(open))});
    document.addEventListener("click",function(e){if(!nav.contains(e.target))close()});
    addEventListener("keydown",function(e){if(e.key==="Escape"&&nav.classList.contains("open")){close();mb.focus()}});
    nav.classList.add("has-menu");
  }
}

if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;
document.documentElement.classList.add("fx");

/* 2 · hero word stagger (handles <br> and .grad-text) */
var h=document.querySelector("h1.display");
if(h){h.classList.add("stagger");var i=0;
  function wrap(node){
    Array.prototype.slice.call(node.childNodes).forEach(function(n){
      if(n.nodeType===3){
        var frag=document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function(part){
          if(!part)return;
          if(/^\s+$/.test(part)){frag.appendChild(document.createTextNode(part));return}
          var s=document.createElement("span");s.className="w";
          s.style.setProperty("--i",i++);s.textContent=part;frag.appendChild(s);
        });
        node.replaceChild(frag,n);
      }else if(n.nodeType===1&&n.tagName!=="BR"){wrap(n)}
    });
  }
  wrap(h);
}

/* 3 · scroll reveals with gentle stagger */
var rvs=document.querySelectorAll(".glass,.bubble,.kpi");
rvs.forEach(function(el){el.classList.add("rv")});
var io=new IntersectionObserver(function(es){
  es.forEach(function(en){
    if(!en.isIntersecting)return;
    var el=en.target;
    el.querySelectorAll(".chart .bar").forEach(function(b,k){b.style.transitionDelay=(k*45)+"ms"});
    el.querySelectorAll(".share .fill").forEach(function(b,k){b.style.transitionDelay=(k*90)+"ms"});
    el.querySelectorAll(".funnel .step").forEach(function(b,k){b.style.transitionDelay=(k*120)+"ms"});
    el.classList.add("inview");
    io.unobserve(el);
    /* release the element after entrance so hover-lift & scales behave natively */
    setTimeout(function(){el.classList.remove("rv","inview");el.style.transitionDelay=""},1500);
  });
},{threshold:.16});
rvs.forEach(function(el,k){el.style.transitionDelay=(k%4*70)+"ms";io.observe(el)});

/* 4 · KPI counters — $48.2k, 2,847, 92, 19+ all parse; "<200ms" is skipped */
document.querySelectorAll(".kpi-num").forEach(function(el){
  var m=el.textContent.trim().match(/^(\$?)([\d,]+(?:\.\d+)?)([a-z%+]*)$/i);
  if(!m)return;
  var target=parseFloat(m[2].replace(/,/g,"")),dec=(m[2].split(".")[1]||"").length;
  var fmt=function(v){return m[1]+v.toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec})+m[3]};
  var io2=new IntersectionObserver(function(es){
    es.forEach(function(en){
      if(!en.isIntersecting)return;io2.disconnect();
      var t0=performance.now(),D=1300;
      requestAnimationFrame(function step(t){
        var p=Math.min(1,(t-t0)/D),e=1-Math.pow(1-p,3);
        el.textContent=fmt(target*e);
        if(p<1)requestAnimationFrame(step);else el.textContent=fmt(target);
      });
    });
  },{threshold:.5});
  io2.observe(el);
});

/* 5 · readiness rings draw from zero */
document.querySelectorAll(".ring .fg").forEach(function(c){
  var target=c.style.strokeDashoffset||c.getAttribute("stroke-dashoffset")||"0";
  c.style.strokeDashoffset=c.getAttribute("stroke-dasharray")||138;
  var io3=new IntersectionObserver(function(es){
    es.forEach(function(en){
      if(!en.isIntersecting)return;
      requestAnimationFrame(function(){c.style.strokeDashoffset=target});
      io3.disconnect();
    });
  },{threshold:.4});
  io3.observe(c);
});
})();
