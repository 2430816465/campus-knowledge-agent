(() => {
 const home=document.querySelector('#home'),open=document.querySelector('#chooseLevel'),panel=home.querySelector('.level-panel');
 const close=document.createElement('button');close.id='closeLevelLibrary';close.type='button';close.className='button button-secondary';close.textContent='完成选择 · 返回';
 panel.querySelector('.panel-heading').append(close);
 function toggle(value){home.classList.toggle('level-library-open',value);open.setAttribute('aria-expanded',String(value));panel.setAttribute('role',value?'dialog':'region');panel.setAttribute('aria-label','关卡选择');if(value){panel.setAttribute('aria-modal','true');close.focus();}else{panel.removeAttribute('aria-modal');open.focus({preventScroll:true});}}
 open.addEventListener('click',()=>toggle(!home.classList.contains('level-library-open')));close.addEventListener('click',()=>toggle(false));
 document.addEventListener('coop-level-selected',()=>toggle(false));
 addEventListener('keydown',e=>{if(e.key==='Escape'&&home.classList.contains('level-library-open')){e.preventDefault();toggle(false);}});
})();
