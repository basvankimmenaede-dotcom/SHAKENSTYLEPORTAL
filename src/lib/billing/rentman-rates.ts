export type RentmanRateFactor = { from: number; to: number; price: number | null; fixed: number | null };
export type RentmanRate = { id: number; name: string; type: string; factors: RentmanRateFactor[] };
const num = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
export const rentmanId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const match = value.match(/(?:^|\\/)(\\d+)$/);
  return match ? Number(match[1]) : null;
};
async function getRentman(path: string): Promise<unknown> {
  const token = process.env.RENTMAN_API_TOKEN;
  if (!token) throw new Error('Rentman API token ontbreekt');
  const response = await fetch('https://api.rentman.net' + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, next: { revalidate: 60 } });
  if (!response.ok) throw new Error('Rentman tarief ophalen mislukt (' + response.status + ')');
  const payload: unknown = await response.json();
  return payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: unknown }).data : null;
}
export async function loadRentmanRate(reference: unknown): Promise<RentmanRate | null> {
  const id = rentmanId(reference);
  if (id === null) return null;
  const [raw, rawFactors] = await Promise.all([getRentman('/rates/' + id), getRentman('/rates/' + id + '/ratefactors')]);
  if (!raw || typeof raw !== 'object') return null;
  const rate = raw as Record<string, unknown>;
  const factors = Array.isArray(rawFactors) ? rawFactors : [];
  return { id, name: String(rate.displayname ?? rate.name ?? id), type: String(rate.type ?? ''), factors: factors.map((f: unknown) => {
    const v = f as Record<string, unknown>;
    return { from: num(v.from) ?? 0, to: num(v.to) ?? Number.MAX_SAFE_INTEGER, price: num(v.price) ?? num(v.hourly_rate), fixed: num(v.fixed) ?? num(v.fixed_price) };
  }) };
}
