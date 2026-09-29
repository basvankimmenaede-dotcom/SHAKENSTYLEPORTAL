'use client';

import { useEffect, useState } from 'react';

type Filter = 'mine' | 'all';

function applyFilter(filter: Filter) {
  const list = document.getElementById('planning-task-list');
  if (!list) return;

  list.dataset.taskFilter = filter;

  let total = 0;
  list.querySelectorAll<HTMLElement>('[data-task-section]').forEach((section) => {
    const tasks = Array.from(section.querySelectorAll<HTMLElement>('.todoistTask'))
      .filter((task) => !task.classList.contains('todoistTaskCompleted'));
    const visible = filter === 'mine'
      ? tasks.filter((task) => task.dataset.taskMine === 'true')
      : tasks;

    total += visible.length;

    const label = section.querySelector<HTMLElement>('[data-task-count-label]');
    if (label) label.textContent = `${visible.length} ${visible.length === 1 ? 'taak' : 'taken'}`;

    section.classList.toggle('planningTaskFilterEmpty', visible.length === 0);
  });

  const openCount = document.querySelector<HTMLElement>('[data-open-task-count]');
  if (openCount) openCount.textContent = `${total} open`;
}

export default function PlanningTaskFilterControls() {
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    const saved = window.localStorage.getItem('planning-task-filter');
    const initial: Filter = saved === 'mine' ? 'mine' : 'all';
    setFilter(initial);
    applyFilter(initial);
  }, []);

  useEffect(() => {
    applyFilter(filter);
    function handleTaskChange() {
      window.setTimeout(() => applyFilter(filter), 0);
    }
    window.addEventListener('planning-task-state-changed', handleTaskChange);
    return () => window.removeEventListener('planning-task-state-changed', handleTaskChange);
  }, [filter]);

  function choose(next: Filter) {
    setFilter(next);
    window.localStorage.setItem('planning-task-filter', next);
    applyFilter(next);
  }

  return (
    <div className="planningTaskFilters" aria-label="Takenfilter">
      <button type="button" className={filter === 'mine' ? 'active' : ''} onClick={() => choose('mine')}>
        Mijn taken
      </button>
      <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => choose('all')}>
        Alles
      </button>
    </div>
  );
}
