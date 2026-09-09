/**
 * Supabase/PostgREST caps every response at 1000 rows (the default max-rows
 * setting), and it caps row-scans SILENTLY — sums stop growing and counts
 * freeze at exactly 1000 with no error. Any query whose result set can ever
 * exceed 1000 rows must paginate. fetchAll() pages through in 1000-row
 * slices until a short page.
 *
 * Usage: pass a function that BUILDS a fresh query (filters included, no
 * .range/.limit needed):
 *   const rows = await fetchAll(() =>
 *     admin.from("deposits").select("amount").eq("status", "success")
 *   );
 */
const PAGE_SIZE = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAll(buildQuery: () => any): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data } = await buildQuery().range(offset, offset + PAGE_SIZE - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * Look up rows by a list of ids without blowing up the ~8KB URL limit —
 * `.in("id", [1000+ uuids])` produces URLs the Supabase gateway rejects.
 * Chunks the ids and unions the results.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchByIdChunks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  buildBase: () => any, // e.g. () => admin.from("profiles").select("id, country")
  ids: string[],
  idColumn: string,
  chunkSize = 200
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data } = await buildBase().in(idColumn, chunk);
    if (data) out.push(...data);
  }
  return out;
}
