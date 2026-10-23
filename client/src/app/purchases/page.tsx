"use client";

import { Suspense } from "react";
import { MovementsPage } from "@/components/MovementsPage";

export default function Page() {
  return (
    <Suspense>
      <MovementsPage kind="purchase" />
    </Suspense>
  );
}
