import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Fetch all rows from a table, paginating past Supabase's default 1,000-row cap.
 * Pass the same chain you'd use for a single query, minus the terminal .order/.limit.
 * The caller is responsible for any filters; ordering is applied internally for stable pagination.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  filters?: { column: string; value: string | boolean | null }[],
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  for (;;) {
    let query = client.from(table).select('*').range(offset, offset + pageSize - 1);
    if (filters) {
      for (const f of filters) {
        query = query.eq(f.column, f.value as string);
      }
    }
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as T[]) ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return all;
}
