import { config } from "./config";

const CURRENCY = config.currency;
const LOCALE = config.locale;

const currency = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});
const currencyExact = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compactCurrency = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  notation: "compact",
  maximumFractionDigits: 1,
});
const number = new Intl.NumberFormat(LOCALE);

export const money = (n: number) => currency.format(n);
export const moneyExact = (n: number) => currencyExact.format(n);
/** Short axis labels. Indian locales use K / L (lakh) / Cr (crore). */
export function moneyCompact(n: number) {
  if (LOCALE.endsWith("-IN")) {
    const sym = currency.formatToParts(0).find((p) => p.type === "currency")?.value ?? "";
    const abs = Math.abs(n);
    const fmt = (v: number, unit: string) => `${n < 0 ? "-" : ""}${sym}${+v.toFixed(1)}${unit}`;
    if (abs >= 1e7) return fmt(abs / 1e7, "Cr");
    if (abs >= 1e5) return fmt(abs / 1e5, "L");
    if (abs >= 1e3) return fmt(abs / 1e3, "K");
    return fmt(abs, "");
  }
  return compactCurrency.format(n);
}
export const count = (n: number) => number.format(n);

export const date = (iso: string | Date) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short", year: "numeric" });

export const dateTime = (iso: string | Date) =>
  new Date(iso).toLocaleString(LOCALE, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function bucketLabel(iso: string, bucket: "day" | "week" | "month") {
  const d = new Date(iso);
  if (bucket === "month") return d.toLocaleDateString(LOCALE, { month: "short" });
  return d.toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

export type StockStatus = "out" | "low" | "ok";
export function stockStatus(stock: number, reorderLevel: number): StockStatus {
  if (stock <= 0) return "out";
  if (stock <= reorderLevel) return "low";
  return "ok";
}

/** Reads the API's error body ({ message, issues }) into one readable line. */
export function errorMessage(err: unknown): string {
  const e = err as { data?: { message?: string; issues?: { path: string; message: string }[] }; status?: unknown; error?: string };
  if (e?.data?.issues?.length) {
    return e.data.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join(". ");
  }
  if (e?.data?.message) return e.data.message;
  if (e?.status === "FETCH_ERROR") return "Can't reach the server. Check your connection and the API URL.";
  return e?.error ?? "Something went wrong. Try again.";
}
