'use client';

import { useCallback, useEffect, useState } from 'react';

export interface UseApiListOptions<T> {
  /** API endpoint URL (e.g. '/api/workflows') */
  url: string;
  /** Optional query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Transform the raw JSON response into the expected shape */
  parse?: (data: unknown) => T[];
  /** Re-fetch when these values change */
  deps?: unknown[];
}

export interface UseApiListResult<T> {
  items: T[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/**
 * Reusable hook for fetching a list of items from an API endpoint.
 * Encapsulates loading state, error handling, and reloading logic.
 */
export function useApiList<T>({
  url,
  params,
  parse = (data) => (Array.isArray(data) ? data as T[] : []),
  deps = [],
}: UseApiListOptions<T>): UseApiListResult<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = new URLSearchParams();
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined) {
            searchParams.set(key, String(value));
          }
        }
      }
      const queryString = searchParams.toString();
      const fetchUrl = queryString ? `${url}?${queryString}` : url;

      const res = await fetch(fetchUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setItems(parse(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { items, loading, error, reload };
}
