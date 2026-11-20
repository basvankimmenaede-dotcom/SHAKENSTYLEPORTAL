const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const ts = require('typescript');

const filename = path.resolve('src/lib/planning-tv-display.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = module.paths;
mod._compile(compiled, filename);

const { paginateTvDays, cursorForPage, reconcileTvCursor } = mod.exports;

const today = '2026-11-20';
const tomorrow = '2026-11-21';
const later = '2026-11-23';

function makeItems(count, firstId = 1) {
  return Array.from({ length: count }, (_, index) => {
    const projectId = firstId + index;
    return {
      key: `${projectId}:0:0`,
      projectId,
      periodIndex: 0,
      kind: 'start',
      namePart: `Project ${projectId}`,
      namePartIndex: 0,
      namePartCount: 1,
    };
  });
}

function oneDayPages(items, heights = {}, availableHeight = 10000, gap = 16) {
  return paginateTvDays(
    [{ date: today, projectIds: items.map(item => item.projectId) }],
    { [today]: items },
    heights,
    availableHeight,
    gap,
  );
}

function keys(pages) {
  return pages.flatMap(page => page.items.map(item => item.key));
}

for (const count of [7, 15]) {
  test(`busy day with ${count} cards shows every card once and never more than three per page`, () => {
    const items = makeItems(count);
    const pages = oneDayPages(items);

    assert.deepEqual(keys(pages), items.map(item => item.key));
    assert.equal(pages.length, Math.ceil(count / 3));
    pages.forEach((page, index) => {
      assert.ok(page.items.length >= 1 && page.items.length <= 3);
      assert.equal(page.pageIndex, index);
      assert.equal(page.pageCount, pages.length);
      assert.equal(page.projectCount, count);
    });
  });
}

test('measured heights and gaps force two cards or one without losing content', () => {
  const items = makeItems(5);
  const heights = Object.fromEntries(items.map((item, index) => [
    item.key,
    [260, 260, 260, 100, 200][index],
  ]));
  const pages = oneDayPages(items, heights, 550, 16);

  assert.deepEqual(pages.map(page => page.items.length), [2, 2, 1]);
  assert.deepEqual(keys(pages), items.map(item => item.key));

  const tallHeights = Object.fromEntries(items.map(item => [item.key, 400]));
  assert.deepEqual(oneDayPages(items, tallHeights, 600).map(page => page.items.length), [1, 1, 1, 1, 1]);
});

test('cards that exactly fit, including the gap, stay on the same page', () => {
  const items = makeItems(3);
  const heights = Object.fromEntries(items.map(item => [item.key, 100]));
  assert.deepEqual(oneDayPages(items, heights, 210, 10).map(page => page.items.length), [2, 1]);
});

test('missing or invalid measurements use the 220px estimate', () => {
  const items = makeItems(5);
  const heights = {
    [items[1].key]: 0,
    [items[2].key]: -10,
    [items[3].key]: NaN,
    [items[4].key]: Infinity,
  };
  assert.deepEqual(oneDayPages(items, heights, 460, 20).map(page => page.items.length), [2, 2, 1]);
});

test('an oversized card and an unmeasured container cannot silently drop a card', () => {
  const items = makeItems(3);
  const pages = oneDayPages(items, { [items[0].key]: 1500 }, 500);
  assert.deepEqual(pages.map(page => page.items.length), [1, 2]);
  assert.deepEqual(keys(pages), items.map(item => item.key));
  assert.deepEqual(keys(oneDayPages(items, {}, 0)), items.map(item => item.key));
});

test('today remains an empty first page while future empty days are skipped', () => {
  const items = makeItems(1);
  const pages = paginateTvDays(
    [
      { date: today, projectIds: [] },
      { date: tomorrow, projectIds: [] },
      { date: later, projectIds: [1] },
    ],
    { [later]: items },
    {},
    700,
    16,
  );

  assert.deepEqual(pages.map(page => page.day), [today, later]);
  assert.deepEqual(pages[0], {
    day: today,
    items: [],
    pageIndex: 0,
    pageCount: 1,
    projectCount: 0,
  });
  assert.deepEqual(cursorForPage(pages[0]), { day: today, anchorKey: null, pageIndex: 0 });
});

test('continuation cards and multiple periods never increase the unique project count', () => {
  const first = makeItems(1)[0];
  const items = [
    first,
    { ...first, key: '1:0:1', namePartIndex: 1, namePartCount: 2 },
    { ...first, key: '1:1:0', periodIndex: 1 },
    { ...first, key: '1:2:0', periodIndex: 2 },
  ];
  const pages = oneDayPages(items);

  assert.deepEqual(keys(pages), items.map(item => item.key));
  assert.ok(pages.every(page => page.projectCount === 1));
});

test('ongoing projects rotate on separate pages from new starts and endings', () => {
  const items = makeItems(5).map((item, index) => ({
    ...item,
    kind: index < 2 ? 'ongoing' : index === 4 ? 'end' : 'start',
  }));
  const pages = oneDayPages(items);

  assert.deepEqual(pages.map(page => page.items.map(item => item.kind)), [
    ['ongoing', 'ongoing'], ['start', 'start', 'end'],
  ]);
  assert.deepEqual(keys(pages), items.map(item => item.key));
  assert.ok(pages.every(page => page.projectCount === 5));
  const cursor = cursorForPage(pages[1]);
  assert.equal(reconcileTvCursor(oneDayPages(items, {}, 250), cursor), 2);
});

test('inserting earlier cards preserves the current anchor after page boundaries move', () => {
  const items = makeItems(7);
  const oldPages = oneDayPages(items);
  const cursor = cursorForPage(oldPages[1]);
  const newPages = oneDayPages([...makeItems(3, 100), ...items]);
  const index = reconcileTvCursor(newPages, cursor);

  assert.equal(index, 2);
  assert.ok(newPages[index].items.some(item => item.key === cursor.anchorKey));
});

test('a resize preserves the anchor even when each card needs a separate page', () => {
  const items = makeItems(7);
  const cursor = cursorForPage(oneDayPages(items)[1]);
  const resizedPages = oneDayPages(items, {}, 250);
  assert.equal(reconcileTvCursor(resizedPages, cursor), 3);
});

test('removing the anchor falls back to the nearest remaining page within its day', () => {
  const items = makeItems(7);
  const cursor = cursorForPage(oneDayPages(items)[2]);
  const newPages = oneDayPages(items.slice(0, 5));

  assert.equal(reconcileTvCursor(newPages, cursor), 1);
  assert.equal(newPages[1].day, today);
});

test('replacing data with identical new arrays never resets the selected page', () => {
  const items = makeItems(15);
  const cursor = cursorForPage(oneDayPages(items)[3]);
  const refreshedItems = items.map(item => ({ ...item }));
  const refreshedPages = oneDayPages(refreshedItems);

  assert.equal(reconcileTvCursor(refreshedPages, { ...cursor }), 3);
});

test('an anchor on another day does not override the cursor day', () => {
  const items = makeItems(1);
  const pages = paginateTvDays(
    [
      { date: today, projectIds: [1] },
      { date: tomorrow, projectIds: [1] },
    ],
    { [today]: items, [tomorrow]: items },
    {},
    700,
    16,
  );

  assert.equal(reconcileTvCursor(pages, cursorForPage(pages[1])), 1);
});

test('a vanished day continues to the next existing day, wrapping after the last', () => {
  const items = makeItems(1);
  const pages = paginateTvDays(
    [
      { date: today, projectIds: [] },
      { date: tomorrow, projectIds: [] },
      { date: later, projectIds: [1] },
    ],
    { [later]: items },
    {},
    700,
    16,
  );

  assert.equal(reconcileTvCursor(pages, { day: tomorrow, anchorKey: null, pageIndex: 0 }), 1);
  assert.equal(reconcileTvCursor(pages, { day: '2026-12-01', anchorKey: null, pageIndex: 0 }), 0);
});

test('missing initial cursor starts at today and an empty input has no valid page', () => {
  const pages = oneDayPages(makeItems(1));
  assert.equal(reconcileTvCursor(pages, null), 0);
  assert.equal(reconcileTvCursor(pages, undefined), 0);
  assert.deepEqual(paginateTvDays([], {}, {}, 700, 16), []);
  assert.equal(reconcileTvCursor([], { day: today, anchorKey: null, pageIndex: 0 }), -1);
});
