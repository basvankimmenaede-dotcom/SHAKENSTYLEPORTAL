import 'server-only';
import { unstable_cache } from 'next/cache';
import {
  amsterdamDateKey,
  amsterdamDayStart,
  normalizeTvAgendaData,
  type TvAgendaSnapshot,
  type TvSourceProject,
  type TvSourceSubproject,
} from './planning-tv';

const API_BASE = 'https://api.rentman.net';
const PAGE_SIZE = 1500;
const MAX_PAGES = 100;
const SOURCE_TIMEOUT_MS = 25000;

type SourceOptions = {
  fetcher?: typeof fetch;
  apiToken?: string;
  now?: () => Date;
  timeoutMs?: number;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sourceUrl(value: string, endpoint: string): URL {
  const url = new URL(value, API_BASE);
  if (url.origin !== API_BASE || url.pathname !== endpoint || url.username || url.password || url.hash) {
    throw new Error('Rentman gaf een ongeldige vervolgpagina; de agenda is niet bijgewerkt.');
  }
  return url;
}

async function fetchAll<T extends TvSourceProject | TvSourceSubproject>(
  endpoint: '/projects' | '/subprojects',
  fields: string,
  apiToken: string,
  fetcher: typeof fetch,
  signal: AbortSignal,
): Promise<T[]> {
  const query = new URLSearchParams({ fields, limit: String(PAGE_SIZE), sort: '+id' });
  let next: string | null = `${endpoint}?${query.toString()}`;
  const seenUrls = new Set<string>();
  const items = new Map<number, T>();

  while (next !== null) {
    const url = sourceUrl(next, endpoint);
    if (seenUrls.size >= MAX_PAGES || seenUrls.has(url.href)) {
      throw new Error('Rentman kon niet volledig worden doorlopen; de agenda is niet bijgewerkt.');
    }
    seenUrls.add(url.href);
    const response = await fetcher(url.href, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error(`Rentman ophalen mislukt (${response.status}); de agenda is niet bijgewerkt.`);
    const payload: unknown = await response.json();
    if (!record(payload) || !Array.isArray(payload.data)) {
      throw new Error('Rentman gaf een onvolledig antwoord; de agenda is niet bijgewerkt.');
    }
    if (payload.itemCount !== undefined && (!Number.isSafeInteger(payload.itemCount) || payload.itemCount !== payload.data.length)) {
      throw new Error('Rentman gaf een onvolledige pagina; de agenda is niet bijgewerkt.');
    }
    for (const item of payload.data) {
      if (!record(item) || !Number.isSafeInteger(item.id) || Number(item.id) <= 0 || typeof item.name !== 'string' || !item.name.trim()) {
        throw new Error('Rentman gaf een ongeldige projectregel; de agenda is niet bijgewerkt.');
      }
      if (endpoint === '/projects' && item.number !== undefined && item.number !== null
        && typeof item.number !== 'string' && typeof item.number !== 'number') {
        throw new Error('Rentman gaf een ongeldig projectnummer; de agenda is niet bijgewerkt.');
      }
      items.set(Number(item.id), item as T);
    }
    if (payload.next_page_url !== undefined && payload.next_page_url !== null && typeof payload.next_page_url !== 'string') {
      throw new Error('Rentman gaf een ongeldige vervolgpagina; de agenda is niet bijgewerkt.');
    }
    next = typeof payload.next_page_url === 'string' && payload.next_page_url.length ? payload.next_page_url : null;
    if (next !== null && payload.data.length === 0) throw new Error('Rentman gaf een lege tussenpagina; de agenda is niet bijgewerkt.');
  }
  return Array.from(items.values());
}

/** One complete source refresh; timestamp is assigned only after every page succeeds. */
export async function loadRentmanTvSnapshot(options: SourceOptions = {}): Promise<TvAgendaSnapshot> {
  const apiToken = options.apiToken ?? process.env.RENTMAN_API_TOKEN;
  if (!apiToken) throw new Error('De Rentman-koppeling is niet ingesteld.');
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? SOURCE_TIMEOUT_MS);
  try {
    const [projects, subprojects] = await Promise.all([
      fetchAll<TvSourceProject>('/projects', 'id,number,name,usageperiod_start,usageperiod_end', apiToken, fetcher, controller.signal),
      fetchAll<TvSourceSubproject>('/subprojects', 'id,name,project,status,in_planning,is_template,usageperiod_start,usageperiod_end', apiToken, fetcher, controller.signal),
    ]);
    const completedAt = now();
    const normalized = normalizeTvAgendaData(projects, subprojects, amsterdamDayStart(amsterdamDateKey(completedAt)));
    return { fetchedAt: completedAt.toISOString(), ...normalized };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Rentman reageert niet op tijd; de laatste complete agenda blijft zichtbaar.');
    throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

// Cache only the complete tenant-wide source snapshot, never authentication.
// An unsuccessful refresh cannot replace the last successful timestamp/data.
export const getTvAgendaSnapshot = unstable_cache(
  () => loadRentmanTvSnapshot(),
  ['planning-tv-usage-snapshot-v1'],
  { revalidate: 30 },
);
