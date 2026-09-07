'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Item = {
  id: number;
  name: string;
  code?: string;
  image?: string | null;
  current_quantity?: number;
};

export default function EquipmentSearch({
  brandId,
  items,
  previewUserId,
}: {
  brandId: number;
  items: Item[];
  previewUserId?: string;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => `${item.name} ${item.code ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="searchBar">
        <input
          className="input searchInput"
          type="search"
          placeholder="Zoek op itemnaam of code..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Zoek in materialen"
        />
        <span className="searchCount">{filtered.length} van {items.length}</span>
      </div>

      {query.trim() && filtered.length === 0 ? (
        <div className="notice">Geen resultaten gevonden voor “{query.trim()}”.</div>
      ) : null}

      <section className="itemGrid">
        {filtered.map((item) => {
          const href = `/portal/brand/${brandId}/item/${item.id}${previewUserId ? `?as=${encodeURIComponent(previewUserId)}` : ''}`;
          return (
            <Link className="itemCard" key={item.id} href={href}>
              <div className="itemImage">
                {item.image ? <img src={item.image} alt={item.name} /> : <span>Geen afbeelding</span>}
              </div>
              <div className="itemBody">
                <span className="badge">{item.code || `#${item.id}`}</span>
                <h3>{item.name}</h3>
                <div className="metric">{item.current_quantity ?? '-'}</div>
                <div className="muted">In beheer</div>
                <div className="itemMore">Bekijk details →</div>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
