
;/*CC_TS_PATCH_v2*/
(function(){
  try{
    if (window.__ccTsInitV2) return; window.__ccTsInitV2 = true;
    var MAP = window.__ccTsMap || {};
    var KEYS = Object.keys(MAP).sort(function(a,b){ return b.length - a.length; }); // longest prefix first
    var liveByKey = {}; // norm(text) -> ISO, captured live

    function norm(t){ return String(t||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').slice(0,200); }
    var CFG = window.__ccTsConfig || {};
    var FORMAT = CFG.format || 'yyyy-MM-dd HH:mm:ss';
    var TZ = CFG.timeZone || 'local';
    function pad(n){ return (n<10?'0':'')+n; }
    // Returns {y,M,d,H,m,s} wall-clock fields of `date` in the configured zone.
    function parts(date){
      var tz = String(TZ).trim();
      var off = /^(?:UTC|GMT)\s*([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(tz);
      if (off){
        var mins = (off[1]==='-'?-1:1)*(parseInt(off[2],10)*60 + (off[3]?parseInt(off[3],10):0));
        var b = new Date(date.getTime() + mins*60000);
        return {y:b.getUTCFullYear(),M:b.getUTCMonth()+1,d:b.getUTCDate(),H:b.getUTCHours(),m:b.getUTCMinutes(),s:b.getUTCSeconds()};
      }
      if (/^utc$/i.test(tz)) tz = 'UTC';
      if (tz && tz.toLowerCase() !== 'local'){
        try{
          var f = new Intl.DateTimeFormat('en-GB',{timeZone:tz,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
          var o = {}; f.formatToParts(date).forEach(function(p){ o[p.type]=p.value; });
          return {y:+o.year,M:+o.month,d:+o.day,H:+o.hour%24,m:+o.minute,s:+o.second};
        }catch(e){ /* invalid zone -> fall through to local */ }
      }
      return {y:date.getFullYear(),M:date.getMonth()+1,d:date.getDate(),H:date.getHours(),m:date.getMinutes(),s:date.getSeconds()};
    }
    function fmt(iso){
      try{
        var d=new Date(iso); if(isNaN(d.getTime())) return null;
        var p=parts(d);
        var h12 = p.H%12===0 ? 12 : p.H%12;
        var map = {yyyy:p.y, MM:pad(p.M), dd:pad(p.d), HH:pad(p.H), hh:pad(h12), mm:pad(p.m), ss:pad(p.s), a:(p.H<12?'AM':'PM')};
        return FORMAT.replace(/yyyy|MM|dd|HH|hh|mm|ss|a/g, function(t){ return map[t]; });
      }catch(e){ return null; }
    }
    window.__ccTsFmt = fmt;
    // live capture (for messages typed during this session)
    window.addEventListener('message', function(e){ try{
      var d=e.data, im=d&&d.message, inner=im&&im.message;
      if(inner&&(inner.type==='user'||inner.type==='assistant')){
        var ts=inner.timestamp||im.timestamp, msg=inner.message||{}, c=msg.content, txt='';
        if(typeof c==='string') txt=c;
        else if(Array.isArray(c)){ for(var i=0;i<c.length;i++){ if(c[i]&&c[i].type==='text') txt+=c[i].text||''; } }
        if(ts&&txt){ var k=norm(txt); if(k) liveByKey[k]=ts; }
      }
    }catch(_){}}, true);

    function findIso(tn){
      for(var i=0;i<KEYS.length;i++){ var k=KEYS[i]; if(k && tn.indexOf(k)===0) return MAP[k]; }
      for(var lk in liveByKey){ if(lk && tn.indexOf(lk)===0) return liveByKey[lk]; }
      return null;
    }
    function stamp(el, isLive){
      try{
        if(!el||el.nodeType!==1||el.__ccTs) return;
        var txt=(el.textContent||'').trim(); if(!txt) return;
        var tn=norm(txt);
        var iso=findIso(tn);
        if(!iso && isLive) iso=new Date().toISOString(); // live message: use current time
        if(!iso) return;                                  // history without a real timestamp: show nothing rather than guess
        el.__ccTs=true;
        var label=fmt(iso); if(!label) return;
        var tag=document.createElement('div'); tag.className='cc-ts'; tag.setAttribute('data-cc-ts','1'); tag.textContent='\uD83D\uDD52 '+label;
        if(el.firstChild) el.insertBefore(tag, el.firstChild); else el.appendChild(tag);
      }catch(_){}
    }
    var booted=false;
    function scan(isLive){ try{ var t=document.querySelectorAll('[class*="turn_"]'); for(var i=0;i<t.length;i++) stamp(t[i], isLive); }catch(_){} }
    var obs=new MutationObserver(function(m){
      for(var i=0;i<m.length;i++){ var a=m[i].addedNodes;
        for(var j=0;j<a.length;j++){ var n=a[j]; if(n&&n.nodeType===1){
          try{ if(n.matches&&n.matches('[class*="turn_"]')) stamp(n,booted);
               if(n.querySelectorAll){ var q=n.querySelectorAll('[class*="turn_"]'); for(var z=0;z<q.length;z++) stamp(q[z],booted); } }catch(_){}
        }}
      }
    });
    function boot(){
      try{ var st=document.createElement('style');
        st.textContent='.cc-ts{display:inline-flex;align-self:flex-start;width:fit-content;max-width:fit-content;flex:0 0 auto;align-items:center;gap:5px;font-size:10px;line-height:1;padding:4px 10px;margin:2px 0 7px 0;border-radius:999px;background:rgba(127,127,127,0.13);border:1px solid rgba(127,127,127,0.18);color:var(--vscode-descriptionForeground,#9b9b9b);font-family:var(--vscode-editor-font-family,ui-monospace,monospace);letter-spacing:.3px;white-space:nowrap;vertical-align:middle;user-select:text;}';
        (document.head||document.documentElement).appendChild(st);
      }catch(_){}
      try{ obs.observe(document.documentElement,{childList:true,subtree:true}); }catch(_){}
      scan(false); setTimeout(function(){scan(false);},1200); setTimeout(function(){scan(false);},3000);
      setTimeout(function(){ booted=true; },4000);
      var n=0, iv=setInterval(function(){ scan(booted); if(++n>20) clearInterval(iv); },1500);
    }
    if(document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  }catch(e){}
})();
