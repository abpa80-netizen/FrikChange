let mounted=false;
export function bindUI({onAction,onChange,onSubmit}={}){
 if(mounted)return;mounted=true;
 document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el)return;e.preventDefault();onAction?.(el.dataset.action,el,e)});
 document.addEventListener('change',e=>onChange?.(e.target,e));
 document.addEventListener('submit',e=>{if(e.target.matches('[data-form]')){e.preventDefault();onSubmit?.(e.target,e)}});
}