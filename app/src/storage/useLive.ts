import { liveQuery } from 'dexie';
import { useEffect, useState } from 'react';

/**
 * Re-runs a Dexie query whenever the tables it reads change, so every screen showing
 * favourites or folders stays in step without manual refreshes.
 */
export function useLive<T>(query: () => Promise<T>, deps: readonly unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const subscription = liveQuery(query).subscribe({
      next: setValue,
      error: () => setValue(initial),
    });
    return () => subscription.unsubscribe();
    // The caller lists the query's inputs in `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}
