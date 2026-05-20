/* Module splash — shared by all admin pages. Call: showSplash('🛍️','Caja','Punto de venta') */
(function(){
  const css=`#ms{position:fixed;inset:0;z-index:9999;background:linear-gradient(150deg,#1C1817 0%,#2E2825 55%,#1C1817 100%);display:flex;align-items:center;justify-content:center;pointer-events:none}#ms.ms-out{animation:ms-curtain .52s cubic-bezier(.76,0,.24,1) forwards}.ms-inner{text-align:center;opacity:0;transform:translateY(14px) scale(.96);transition:opacity .38s ease,transform .38s cubic-bezier(.2,.8,.3,1)}#ms.ms-in .ms-inner{opacity:1;transform:translateY(0) scale(1)}.ms-icon{font-size:3.2rem;display:block;margin-bottom:14px;filter:drop-shadow(0 0 28px rgba(201,164,98,.55))}.ms-name{font-family:'Playfair Display',serif;font-size:2.4rem;font-weight:600;color:#fff;letter-spacing:-.02em;line-height:1}.ms-tag{font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:rgba(201,164,98,.75);margin-top:10px}@keyframes ms-curtain{from{transform:translateY(0)}to{transform:translateY(-100%)}}`;
  const s=document.createElement('style');s.textContent=css;document.head.appendChild(s);
  window.showSplash=function(icon,name,tag){
    const el=document.createElement('div');
    el.id='ms';
    el.innerHTML=`<div class="ms-inner"><span class="ms-icon">${icon}</span><div class="ms-name">${name}</div><div class="ms-tag">${tag}</div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('ms-in')));
    setTimeout(()=>{el.classList.add('ms-out');setTimeout(()=>el.remove(),540)},950);
  };
})();
