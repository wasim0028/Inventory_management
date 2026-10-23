"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useDebounced } from "./hooks";

/** Keeps list filters in the URL so they survive reloads and can be shared. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const state = Object.fromEntries(
    Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? d]),
  ) as T;

  const set = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === "" || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      // Any filter change goes back to page 1 unless the page itself changed.
      if (!("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params, pathname, router],
  );

  return [state, set] as const;
}

/** A search box bound to the `q` URL param, updated after typing pauses. */
export function useSearchBox(q: string, set: (patch: { q: string }) => void) {
  const [value, setValue] = useState(q);
  const debounced = useDebounced(value, 300);
  useEffect(() => {
    if (debounced !== q) set({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);
  // Follow the URL when it changes from elsewhere (e.g. the search palette).
  useEffect(() => setValue(q), [q]);
  return [value, setValue] as const;
}
