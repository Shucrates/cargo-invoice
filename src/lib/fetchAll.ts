/**
 * Loads every row from an offset-paginated list endpoint (`limit`/`offset`
 * in, `hasMore` out), so views that aggregate data — reports, bill payment
 * status, the cash book — never silently work from a truncated first page.
 *
 * @param url   Endpoint with any filters already in its query string.
 * @param key   Name of the array field in the JSON response (e.g. 'dockets').
 */
export async function fetchAllPages<T>(url: string, key: string, pageSize = 500): Promise<T[]> {
  const all: T[] = [];
  const sep = url.includes('?') ? '&' : '?';
  // Hard stop so a misbehaving endpoint can't loop forever.
  for (let page = 0; page < 200; page++) {
    const res = await fetch(`${url}${sep}limit=${pageSize}&offset=${page * pageSize}`);
    if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
    const data = await res.json();
    const rows: T[] = data[key] ?? [];
    all.push(...rows);
    if (!data.hasMore || rows.length === 0) break;
  }
  return all;
}
