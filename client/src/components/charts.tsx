"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { bucketLabel, money, moneyCompact } from "@/lib/format";
import type { Dashboard } from "@/state/api";

const SERIES = [
  { key: "revenue", label: "Sales", color: "var(--series-1)" },
  { key: "cost", label: "Stock purchased", color: "var(--series-2)" },
] as const;

function SeriesTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2 text-sm shadow-lg">
      <div className="mb-1 text-xs text-ink-2">{label}</div>
      {SERIES.map((s) => {
        const v = payload.find((p) => p.dataKey === s.key)?.value ?? 0;
        return (
          <div key={s.key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-2 text-ink-2">
              <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
            <span className="num font-medium text-ink">{money(Number(v))}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Sales and stock purchases per period, side by side on one shared money axis. */
export function SalesChart({ data }: { data: Dashboard }) {
  const rows = data.series.map((s) => ({ ...s, label: bucketLabel(s.bucket, data.bucket) }));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-[13px] text-ink-2" aria-hidden>
        {SERIES.map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-72" role="img" aria-label={`Sales and stock purchased per ${data.bucket}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={{ stroke: "var(--line-strong)" }}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v) => moneyCompact(v)}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--ink-3)", fontSize: 12 }}
              width={64}
            />
            <Tooltip content={SeriesTooltip} cursor={{ fill: "var(--line)", opacity: 0.5 }} />
            {SERIES.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[4, 4, 0, 0]}
                maxBarSize={18}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Sales and stock purchased</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>Sales</th>
            <th>Stock purchased</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bucket}>
              <td>{r.label}</td>
              <td>{money(r.revenue)}</td>
              <td>{money(r.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Horizontal bars for ranked amounts: single hue, labels in ink, value at the end. */
export function RankedBars({
  rows,
  format = money,
  onSelect,
}: {
  rows: { key: string; label: string; sub?: string; value: number }[];
  format?: (n: number) => string;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const content = (
          <>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                {r.label}
                {r.sub && <span className="ml-2 text-xs text-ink-3">{r.sub}</span>}
              </span>
              <span className="num shrink-0 font-medium">{format(r.value)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-line/60">
              <div className="h-full rounded-full bg-series-1" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
            </div>
          </>
        );
        return (
          <li key={r.key}>
            {onSelect ? (
              <button onClick={() => onSelect(r.key)} className="block w-full rounded-md text-left hover:opacity-80">
                {content}
              </button>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
