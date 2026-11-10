'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';

/** Keep previously shared anchor links functional after splitting settings into pages. */
export default function LegacySettingsRedirect(){
  const router=useRouter();
  useEffect(()=>{
    const anchor=window.location.hash;
    if(anchor==='#factuur-email')router.replace('/planning/instellingen/facturen');
    if(anchor==='#terugkerende-taken')router.replace('/planning/instellingen/terugkerende-taken');
  },[router]);
  return null;
}
