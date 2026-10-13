'use client';
import { useEffect, useRef, type ReactNode } from 'react';
export default function Dialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=> { const previous=document.activeElement as HTMLElement|null; const dialog=ref.current; dialog?.showModal(); return ()=>{dialog?.close();previous?.focus();}; },[]);
  return <dialog ref={ref} className="app-dialog" aria-label={title} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><header><h2>{title}</h2><button aria-label="Fermer / Close" onClick={onClose}>✕</button></header>{children}</dialog>;
}
