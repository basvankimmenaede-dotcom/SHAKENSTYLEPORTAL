'use client';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, CircleAlert, Info } from 'lucide-react';
type ToastType='success'|'error'|'info';
const ToastContext=createContext<{showToast:(message:string,type?:ToastType)=>void}|null>(null);
export function useToast(){const value=useContext(ToastContext);if(!value)throw new Error('useToast must be used inside ToastProvider');return value;}
export default function ToastProvider({children}:{children:React.ReactNode}){
  const [toast,setToast]=useState<{message:string;type:ToastType}|null>(null);
  const showToast=useCallback((message:string,type:ToastType='success')=>{setToast({message,type});window.setTimeout(()=>setToast(current=>current?.message===message?null:current),3200)},[]);
  const value=useMemo(()=>({showToast}),[showToast]); const Icon=toast?.type==='error'?CircleAlert:toast?.type==='info'?Info:CheckCircle2;
  return <ToastContext.Provider value={value}>{children}{toast?<div className={`uiToast ${toast.type}`} role="status" aria-live="polite"><Icon size={18} strokeWidth={2}/><span>{toast.message}</span></div>:null}</ToastContext.Provider>
}
