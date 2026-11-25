import { useState, useEffect, useCallback, useRef } from 'react';
import { requestError } from '../api/errors';
import type { AxiosResponse } from 'axios';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<AxiosResponse<T>>,
  deps: unknown[] = []
): UseApiState<T> {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const counter = useRef(0);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    const id = ++counter.current;
    fetcher()
      .then(res => { if (id === counter.current) { setData(res.data); setLoading(false); } })
      .catch(err => {
        if (id === counter.current) {
          setError(requestError(err, 'Could not load this information. Please try again.'));
          setLoading(false);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, error, refresh };
}
