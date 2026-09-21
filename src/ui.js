export function bindUI(){
  const handleClick=e=>{
    const btn=e.target.closest('button');
    if(!btn)return;
    const action=btn.dataset.action;
    if(action==='signup'){
      e.preventDefault();
      if(typeof window.openAuth==='function')window.openAuth(true);
      return;
    }
    if(action==='publish'){
      e.preventDefault();
      if(typeof window.handlePublish==='function')window.handlePublish();
      return;
    }
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>document.addEventListener('click',handleClick));
  else document.addEventListener('click',handleClick);
}
