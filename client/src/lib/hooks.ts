"use client";

import { useEffect, useState } from "react";
import { useGetMeQuery } from "@/state/api";

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Members of the Cognito "admin" group can archive, delete and manage the team. */
export function useIsAdmin() {
  const { data } = useGetMeQuery();
  return Boolean(data?.groups.includes("admin"));
}
