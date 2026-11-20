const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTs(file, mocks = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports,
    require: (name) => name in mocks ? mocks[name] : require(name),
    Date, Intl, Map, Set, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    process: { env: {} },
  }, { filename: file });
  return module.exports;
}
const domain = loadTs('src/lib/planning-tv.ts');
const { amsterdamDateKey, amsterdamDayStart, addCalendarDays, usageTimestamp, rentmanReferenceId, normalizeTvAgendaData, buildTvAgendaWindow } = domain;
const source = loadTs('src/lib/rentman-planning-tv.ts', {
  'server-only': {}, './planning-tv': domain, 'next/cache': { unstable_cache: (callback) => callback },
});
const plain = (value) => JSON.parse(JSON.stringify(value));
const parent = (id = 1, extra = {}) => ({ id, number: String(10000 + id), name: `Project ${id}`, ...extra });
const sub = (id = 1, extra = {}) => ({
  id, name: `Subproject ${id}`, project: '/projects/1', status: '/statuses/3', in_planning: true, is_template: false,
  usageperiod_start: '2026-11-20T12:00:00+01:00', usageperiod_end: '2026-11-20T23:00:00+01:00', ...extra,
});
const snapshot = (projects, subprojects) => ({ fetchedAt: '2026-11-20T10:00:00Z', ...normalizeTvAgendaData(projects, subprojects) });

test('30 Amsterdam calendar dates include today and end at today + 29', () => {
  const window = buildTvAgendaWindow(snapshot([], []), '2026-11-20');
  assert.equal(window.days.length, 30);
  assert.equal(window.days[0].date, '2026-11-20');
  assert.equal(window.days[29].date, '2026-12-19');
  assert.equal(amsterdamDateKey(new Date('2026-11-19T23:30:00Z')), '2026-11-20');
  assert.equal(addCalendarDays('2028-02-28', 1), '2028-02-29');
  assert.throws(() => addCalendarDays('2026-02-30', 1), /kalenderdatum/);
});

test('Amsterdam midnight follows both DST transitions, not fixed 24-hour increments', () => {
  assert.equal(amsterdamDayStart('2026-03-30') - amsterdamDayStart('2026-03-29'), 23 * 3600000);
  assert.equal(amsterdamDayStart('2026-10-26') - amsterdamDayStart('2026-10-25'), 25 * 3600000);
  const data = snapshot([parent()], [sub(1, { usageperiod_start: '2026-03-29T23:30:00+02:00', usageperiod_end: '2026-03-30T00:00:00+02:00' })]);
  const window = buildTvAgendaWindow(data, '2026-03-29');
  assert.equal(window.days[0].projectIds.length, 1);
  assert.equal(window.days[1].projectIds.length, 0);
});

test('midnight end is exclusive; midnight start belongs to the new local day', () => {
  const data = snapshot([parent(1), parent(2)], [
    sub(1, { usageperiod_start: '2026-11-19T20:00:00Z', usageperiod_end: '2026-11-19T23:00:00Z' }),
    sub(2, { project: '/projects/2', usageperiod_start: '2026-11-19T23:00:00Z', usageperiod_end: '2026-11-20T01:00:00Z' }),
  ]);
  const window = buildTvAgendaWindow(data, '2026-11-20');
  assert.deepEqual(plain(window.days[0].projectIds), [2]);
  assert.equal(window.total, 1);
});

test('old ongoing job survives; identical subproject periods count one parent', () => {
  const longUsage = { usageperiod_start: '2026-05-26T14:00:00+02:00', usageperiod_end: '2026-11-28T23:30:00+01:00' };
  const data = snapshot([parent(1)], [sub(1, longUsage), sub(2, longUsage), sub(2, longUsage)]);
  assert.equal(data.projects[0].periods.length, 1);
  assert.deepEqual(plain(data.projects[0].periods[0].subprojectIds), [1, 2]);
  assert.equal(data.issues.length, 0);
  const window = buildTvAgendaWindow(data, '2026-11-20');
  assert.equal(window.total, 1);
  assert.equal(window.days.filter((day) => day.projectIds.length).length, 9);
});

test('window overlap includes both edge crossings and advances after local midnight', () => {
  const data = snapshot([parent(1), parent(2), parent(3)], [
    sub(1, { usageperiod_start: '2026-11-19T12:00:00+01:00', usageperiod_end: '2026-11-20T02:00:00+01:00' }),
    sub(2, { project: '/projects/2', usageperiod_start: '2026-12-19T23:00:00+01:00', usageperiod_end: '2026-12-21T02:00:00+01:00' }),
    sub(3, { project: '/projects/3', usageperiod_start: '2026-12-20T00:00:00+01:00', usageperiod_end: '2026-12-20T02:00:00+01:00' }),
  ]);
  const current = buildTvAgendaWindow(data, '2026-11-20');
  assert.equal(current.total, 2);
  assert.deepEqual(plain(current.days[29].projectIds), [2]);
  assert.equal(current.projects.find((project) => project.id === 2).periods[0].end, '2026-12-21T02:00:00+01:00');
  const next = buildTvAgendaWindow(data, '2026-11-21');
  assert.equal(next.total, 2);
  assert.deepEqual(plain(next.days[29].projectIds), [2, 3]);
});

test('overlapping distinct subperiods still count only one job per day', () => {
  const data = snapshot([parent()], [
    sub(1, { usageperiod_end: '2026-11-22T18:00:00+01:00' }),
    sub(2, { usageperiod_start: '2026-11-21T12:00:00+01:00', usageperiod_end: '2026-11-23T18:00:00+01:00' }),
  ]);
  const window = buildTvAgendaWindow(data, '2026-11-20');
  assert.equal(window.total, 1);
  assert.deepEqual(plain(window.days.slice(0, 4).map((day) => day.projectIds.length)), [1, 1, 1, 1]);
  assert.equal(data.projects[0].periods.length, 2);
  assert.equal(data.issues[0].kind, 'ambiguous_usage');
});

test('distinct subproject periods preserve gaps and real times, with explicit ambiguity', () => {
  const data = snapshot([parent()], [
    sub(1, { name: 'Eerste moment' }),
    sub(2, { name: 'Tweede moment', usageperiod_start: '2026-11-22T12:00:00+01:00', usageperiod_end: '2026-11-22T23:00:00+01:00' }),
  ]);
  const window = buildTvAgendaWindow(data, '2026-11-20');
  assert.deepEqual(plain(window.days.slice(0, 3).map((day) => day.projectIds.length)), [1, 0, 1]);
  assert.equal(window.total, 1);
  assert.equal(data.projects[0].periods.length, 2);
  assert.equal(data.issues[0].kind, 'ambiguous_usage');
  assert.match(data.issues[0].reason, /Eerste moment; Tweede moment/);
});

test('concepts are included; excluded siblings do not cancel an eligible parent', () => {
  const data = snapshot([parent()], [
    sub(1, { status: '/statuses/2' }), sub(2, { status: '/projectstatuses/3' }),
    sub(3, { status: { id: 8 } }),
    ...[1, 7].map((status) => sub(status + 10, { status: { id: status }, usageperiod_start: '2026-11-22T12:00:00+01:00', usageperiod_end: '2026-11-22T23:00:00+01:00' })),
  ]);
  assert.equal(data.projects.length, 1);
  assert.deepEqual(plain(data.projects[0].periods[0].subprojectIds), [2, 3]);
  assert.equal(data.issues.length, 0);
  assert.equal(rentmanReferenceId('/projectstatuses/1002', ['statuses', 'projectstatuses']), 1002);
  assert.equal(rentmanReferenceId('/contacts/3', ['statuses', 'projectstatuses']), null);
});

test('missing status or planning flag is warned; explicit template/out-of-planning is ignored', () => {
  const data = snapshot([parent()], [
    sub(1, { status: null }), sub(2, { in_planning: undefined }),
    sub(3, { is_template: true }), sub(4, { in_planning: false }),
  ]);
  assert.equal(data.projects.length, 0);
  assert.equal(data.issues.length, 2);
  assert.ok(data.issues.every((issue) => issue.kind === 'unknown_status'));
  assert.equal(snapshot([parent()], [sub(1, { status: '/projectstatuses/9001' })]).projects.length, 1);
});

test('missing or invalid usage never falls back to project or planning dates', () => {
  const dates = { usageperiod_start: '2026-11-20T12:00:00+01:00', usageperiod_end: '2026-11-20T23:00:00+01:00' };
  const data = snapshot([parent(1, dates)], [sub(1, { usageperiod_start: null, usageperiod_end: null, planperiod_start: dates.usageperiod_start, planperiod_end: dates.usageperiod_end })]);
  assert.equal(data.projects.length, 0);
  assert.equal(data.issues[0].kind, 'missing_usage');
  assert.equal(usageTimestamp('2026-02-30T12:00:00+01:00'), null);
  assert.equal(usageTimestamp('2026-11-20T12:00:00'), null);
  assert.equal(usageTimestamp('2026-11-20T24:00:00+01:00'), null);
  assert.equal(snapshot([parent()], [sub(1, { usageperiod_end: '2026-11-20T12:00:00+01:00' })]).projects.length, 0);
});

test('orphan subproject is a visible issue, never a fabricated main job', () => {
  const data = snapshot([], [sub(1)]);
  assert.equal(data.projects.length, 0);
  assert.equal(data.issues[0].kind, 'missing_project');
  assert.equal(data.issues[0].projectId, 1);
});

// Audit-derived snapshot, 20 November 2026: 32 overlapping main jobs.
// IDs and project numbers are anonymized; the audited statuses and usage dates are retained.
const realRows = [
  [1, '9001', 10001, 1001, '2026-05-26T14:00:00+02:00', '2026-11-28T23:30:00+01:00'],
  [2, '9002', 10002, 1, '2026-12-04T07:00:00+01:00', '2026-12-05T23:00:00+01:00'],
  [3, '9003', 10003, 8, '2026-12-11T00:00:00+01:00', '2026-12-12T01:00:00+01:00'],
  [4, '9004', 10004, 8, '2026-11-30T00:00:00+01:00', '2026-12-01T12:30:00+01:00'],
  [5, '9005', 10005, 8, '2026-11-30T00:00:00+01:00', '2026-12-01T12:30:00+01:00'],
  [6, '9006', 10006, 8, '2026-12-10T00:00:00+01:00', '2026-12-11T08:00:00+01:00'],
  [7, '9007', 10007, 3, '2026-11-24T00:00:00+01:00', '2026-11-25T11:30:00+01:00'],
  [8, '9008', 10008, 1001, '2026-11-21T00:00:00+01:00', '2026-11-22T02:30:00+01:00'],
  [9, '9009', 10009, 1, '2026-11-27T00:00:00+01:00', '2026-11-28T08:00:00+01:00'],
  [10, '9010', 10010, 2, '2026-12-16T00:00:00+01:00', '2026-12-16T08:00:00+01:00'],
  [11, '9011', 10011, 8, '2026-12-10T00:00:00+01:00', '2026-12-11T08:00:00+01:00'],
  [12, '9012', 10012, 2, '2026-11-22T00:00:00+01:00', '2026-11-22T08:00:00+01:00'],
  [13, '9013', 10013, 8, '2026-12-17T00:00:00+01:00', '2026-12-18T08:00:00+01:00'],
  [14, '9014', 10014, 3, '2026-11-13T14:00:00+01:00', '2026-11-23T10:30:00+01:00'],
  [15, '9015', 10015, 8, '2026-11-27T00:00:00+01:00', '2026-11-28T08:00:00+01:00'],
  [16, '9016', 10016, 1001, '2026-11-20T12:00:00+01:00', '2026-11-23T10:00:00+01:00'],
  [17, '9017', 10017, 8, '2026-12-10T12:00:00+01:00', '2026-12-10T23:30:00+01:00'],
  [18, '9018', 10018, 1, '2026-11-28T08:00:00+01:00', '2026-11-29T11:45:00+01:00'],
  [19, '9019', 10019, 8, '2026-12-17T12:00:00+01:00', '2026-12-17T23:00:00+01:00'],
  [20, '9020', 10020, 3, '2026-11-26T12:00:00+01:00', '2026-11-26T23:30:00+01:00'],
  [21, '9021', 10021, 3, '2026-12-18T12:00:00+01:00', '2026-12-19T05:00:00+01:00'],
  [22, '9022', 10022, 8, '2026-12-17T12:00:00+01:00', '2026-12-18T10:00:00+01:00'],
  [23, '9023', 10023, 8, '2026-12-11T12:00:00+01:00', '2026-12-11T23:30:00+01:00'],
  [24, '9024', 10024, 8, '2026-12-12T00:00:00+01:00', '2026-12-13T08:00:00+01:00'],
  [25, '9025', 10025, 8, '2026-12-16T12:00:00+01:00', '2026-12-16T23:00:00+01:00'],
  [26, '9026', 10026, 3, '2026-11-27T12:00:00+01:00', '2026-11-27T23:00:00+01:00'],
  [27, '9027', 10027, 8, '2026-12-11T12:00:00+01:00', '2026-12-12T00:30:00+01:00'],
  [28, '9028', 10028, 8, '2026-11-20T00:00:00+01:00', '2026-11-23T08:00:00+01:00'],
  [29, '9029', 10029, 8, '2026-12-10T10:00:00+01:00', '2026-12-11T12:00:00+01:00'],
  [30, '9030', 10030, 8, '2026-12-15T10:00:00+01:00', '2026-12-16T12:00:00+01:00'],
  [31, '9031', 10031, 8, '2026-12-18T10:00:00+01:00', '2026-12-19T12:00:00+01:00'],
  [32, '9032', 10032, 8, '2026-11-27T12:00:00+01:00', '2026-11-28T00:00:00+01:00'],
];
test('anonymized audit snapshot includes 19 concepts in 27 unique jobs and verified daily counts', () => {
  const data = snapshot(realRows.map(([id, number]) => parent(id, { number })), realRows.map(([id, , subId, status, start, end]) => sub(subId, {
    project: `/projects/${id}`, status: `/statuses/${status}`, usageperiod_start: start, usageperiod_end: end,
  })));
  const window = buildTvAgendaWindow(data, '2026-11-20');
  assert.equal(window.total, 27);
  assert.deepEqual(plain(window.days.map((day) => day.projectIds.length)), [4, 5, 5, 4, 2, 2, 2, 4, 2, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 4, 6, 3, 1, 0, 1, 2, 3, 4, 2]);
  assert.equal(data.issues.length, 0);
});

const jsonResponse = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
test('full pagination publishes one snapshot only after both resource lists complete', async () => {
  const calls = [];
  let clockCalls = 0;
  const result = await source.loadRentmanTvSnapshot({
    apiToken: 'test-token', now: () => { clockCalls += 1; assert.equal(calls.length, 3); return new Date('2026-11-20T10:00:00Z'); },
    fetcher: async (input, options) => {
      const url = new URL(input); calls.push(url.href);
      assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
      if (url.pathname === '/subprojects') return jsonResponse({ data: [sub(1), sub(2, { project: '/projects/2' })], itemCount: 2 });
      if (url.searchParams.has('cursor')) return jsonResponse({ data: [parent(2)], next_page_url: null });
      return jsonResponse({ data: [parent(1)], next_page_url: 'https://api.rentman.net/projects?cursor=next' });
    },
  });
  assert.equal(clockCalls, 1);
  assert.equal(result.fetchedAt, '2026-11-20T10:00:00.000Z');
  assert.equal(result.projects.length, 2);
});

test('partial or malformed responses cannot publish a false empty agenda or success timestamp', async () => {
  let clockCalls = 0;
  for (const bad of [{}, { data: {} }, { data: [], itemCount: 1 }, { data: [{ id: 1 }] }, { data: [], next_page_url: 5 }]) {
    await assert.rejects(source.loadRentmanTvSnapshot({ apiToken: 'test-token', now: () => { clockCalls += 1; return new Date(); }, fetcher: async () => jsonResponse(bad) }));
  }
  await assert.rejects(source.loadRentmanTvSnapshot({ apiToken: 'test-token', now: () => { clockCalls += 1; return new Date(); }, fetcher: async (input) => new URL(input).pathname === '/projects' ? jsonResponse({ data: [parent()] }) : jsonResponse({}, 503) }));
  assert.equal(clockCalls, 0);
});

test('pagination cannot forward the Rentman token to another origin or loop forever', async () => {
  const calls = [];
  await assert.rejects(source.loadRentmanTvSnapshot({ apiToken: 'test-token', fetcher: async (input) => {
    calls.push(input);
    return jsonResponse({ data: [parent()], next_page_url: 'https://example.com/projects?cursor=next' });
  } }), /vervolgpagina/);
  assert.ok(calls.every((url) => new URL(url).origin === 'https://api.rentman.net'));
  await assert.rejects(source.loadRentmanTvSnapshot({ apiToken: 'test-token', fetcher: async (input) => jsonResponse({ data: [parent()], next_page_url: input }) }), /doorlopen/);
});

test('a slow source aborts the entire refresh rather than publishing partial data', async () => {
  await assert.rejects(source.loadRentmanTvSnapshot({
    apiToken: 'test-token', timeoutMs: 5,
    fetcher: async (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })),
  }), /niet op tijd/);
});

function routeFor({ user = { id: 'user-1' }, profile = { role: 'warehouse' }, level = 'view' } = {}) {
  let reads = 0;
  const route = loadTs('src/app/api/planning/tv/route.ts', {
    'next/server': { NextResponse: { json: (body, options = {}) => ({ body, status: options.status ?? 200, headers: options.headers }) } },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user }, error: null }) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }) }) }) }) },
    '@/lib/auth': { getUserPermissionLevel: async (_client, _id, key) => { assert.equal(key, 'planning'); return level; }, permissionAtLeast: (value) => ['view', 'manage'].includes(value) },
    '@/lib/rentman-planning-tv': { getTvAgendaSnapshot: async () => { reads += 1; return snapshot([], []); } },
  });
  return { route, reads: () => reads };
}
test('API denies anonymous and unprivileged users before any shared snapshot read', async () => {
  for (const [options, status] of [[{ user: null }, 401], [{ profile: null }, 403], [{ level: 'own' }, 403], [{ level: 'none' }, 403]]) {
    const { route, reads } = routeFor(options);
    assert.equal((await route.GET()).status, status);
    assert.equal(reads(), 0);
  }
});
test('API preserves admin and explicit planning-view access and forbids HTTP caching', async () => {
  for (const options of [{ profile: { role: 'admin' }, level: 'none' }, { profile: { role: 'warehouse' }, level: 'view' }]) {
    const { route, reads } = routeFor(options);
    const response = await route.GET();
    assert.equal(response.status, 200);
    assert.equal(reads(), 1);
    assert.match(response.headers['Cache-Control'], /private, no-store/);
  }
});
