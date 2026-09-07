'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SyncRentmanButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();

  async function sync() {
    setLoading(true);
    setMessage('');
    const response = await fetch('/api/admin/sync-rentman-folders', { method: 'POST' });
    const body = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setMessage(body.error ?? 'Synchronisatie mislukt.');
      return;
    }
    setMessage(`${body.folders_synced ?? 0} mappen gesynchroniseerd.`);
    router.refresh();
  }

  return (
    <div className="inline">
      <button className="button orange" onClick={sync} disabled={loading}>
        {loading ? 'Synchroniseren...' : 'Synchroniseer beheer'}
      </button>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
