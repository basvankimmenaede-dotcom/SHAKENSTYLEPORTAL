'use client';

import { useEffect, useState } from 'react';

type Filter = 'mine' | 'all';

function applyFilter(filter: Filter, canSeeOffice: boolean, showWarehouse: boolean) {
  const list = document.getElementById('planning-task-list');
  if (!list) return;

  list.dataset.taskFilter = filter;

  let total = 0;
  list.querySelectorAll<HTMLElement>('[data-task-section]').forEach((section) => {
    const tasks = Array.from(section.querySelectorAll<HTMLElement>('.todoistTask'))
      .filter((task) => !task.classList.contains('todoistTaskCompleted'));

    const visible = tasks.filter((task) => {
      const mine = task.dataset.taskMine === 'true';
      const area = task.dataset.taskArea || 'office';
      const areaVisible = canSeeOffice
        ? area === 'office' || showWarehouse
        : area === 'warehouse';

      if (!areaVisible) return false;
      return filter === 'mine' ? mine : true;
    });

    tasks.forEach((task) => {
      const area = task.dataset.taskArea || 'office';
      const areaVisible = canSeeOffice
        ? area === 'office' || showWarehouse
        : area === 'warehouse';
      const mineVisible = filter === 'all' || task.dataset.taskMine === 'true';
      task.hidden = !(areaVisible && mineVisible);
    });

    total += visible.length;

    const label = section.querySelector<HTMLElement>('[data-task-count-label]');
    if (label) label.textContent = `${visible.length} ${visible.length === 1 ? 'taak' : 'taken'}`;

    section.classList.toggle('planningTaskFilterEmpty', visible.length === 0);
  });

  const openCount = document.querySelector<HTMLElement>('[data-open-task-count]');
  if (openCount) openCount.textContent = `${total} open`;
}

export default function PlanningTaskFilterControls({
  canSeeOffice = false,
}: {
  canSeeOffice?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [showWarehouse, setShowWarehouse] = useState(!canSeeOffice);

  useEffect(() => {
    const saved = window.localStorage.getItem('planning-task-filter');
    const initial: Filter = saved === 'mine' ? 'mine' : 'all';
    const savedWarehouse = window.localStorage.getItem('planning-show-warehouse') === 'true';
    setFilter(initial);
    setShowWarehouse(canSeeOffice ? savedWarehouse : true);
    applyFilter(initial, canSeeOffice, canSeeOffice ? savedWarehouse : true);
  }, [canSeeOffice]);

  useEffect(() => {
    applyFilter(filter, canSeeOffice, showWarehouse);
    function handleTaskChange() {
      window.setTimeout(() => applyFilter(filter, canSeeOffice, showWarehouse), 0);
    }
    window.addEventListener('planning-task-state-changed', handleTaskChange);
    return () => window.removeEventListener('planning-task-state-changed', handleTaskChange);
  }, [filter, canSeeOffice, showWarehouse]);

  function choose(next: Filter) {
    setFilter(next);
    window.localStorage.setItem('planning-task-filter', next);
  }

  function toggleWarehouse() {
    if (!canSeeOffice) return;
    const next = !showWarehouse;
    setShowWarehouse(next);
    window.localStorage.setItem('planning-show-warehouse', String(next));
  }

  return (
    <div className="planningTaskFilters" aria-label="Takenfilter">
      <button type="button" className={filter === 'mine' ? 'active' : ''} onClick={() => choose('mine')}>
        Mijn taken
      </button>
      <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => choose('all')}>
        {canSeeOffice ? 'Kantoor' : 'Alle magazijn'}
      </button>
      {canSeeOffice ? (
        <button type="button" className={showWarehouse ? 'active' : ''} onClick={toggleWarehouse}>
          + Magazijn
        </button>
      ) : null}
    </div>
  );
}
