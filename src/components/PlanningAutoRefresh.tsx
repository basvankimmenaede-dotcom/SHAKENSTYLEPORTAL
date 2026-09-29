'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

function isUserInteracting() {
  if (document.querySelector('[data-planning-modal-open="true"]')) return true;
  if (document.querySelector('[aria-busy="true"]')) return true;

  const active = document.activeElement;
  if (!active || active === document.body) return false;

  return active.matches('input, select, textarea, [contenteditable="true"]');
}

export default function PlanningAutoRefresh({
  intervalMs = 300000,
}: {
  intervalMs?: number;
}) {
  const router = useRouter();
  const lastRefresh = useRef(Date.now());

  useEffect(() => {
    function refreshIfSafe(force = false) {
      if (document.visibilityState !== 'visible') return;
      if (!force && Date.now() - lastRefresh.current < intervalMs) return;
      if (isUserInteracting()) return;

      lastRefresh.current = Date.now();
      router.refresh();
    }

    const timer = window.setInterval(() => refreshIfSafe(true), intervalMs);

    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      window.setTimeout(() => refreshIfSafe(false), 250);
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, router]);

  return null;
}
