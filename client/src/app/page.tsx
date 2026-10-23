"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDownToLine, ArrowDownRight, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { useGetDashboardQuery, type Dashboard, type Range } from "@/state/api";
import { openDialog, openProduct, useAppDispatch } from "@/state/store";
import { count, errorMessage, money } from "@/lib/format";
import { RankedBars, SalesChart } from "@/components/charts";
import { Button, cx, ErrorState, PageHeader, Panel, Segmented, Skeleton, StockGauge } from "@/components/ui";

const RANGE_LABEL: Record<Range, string> = {
  "7d": "previous 7 days",
  "30d": "previous 30 days",
  "90d": "previous 90 days",
  "12m": "previous 12 months",
};

function Change({ value, range }: { value: number | null; range: Range }) {
  // Hide changes that are meaningless (no prior data, or enormous swings off a tiny base).
  if (value === null || Math.abs(value) > 999) {
    return <span className="text-xs text-ink-3">No comparison</span>;
  }
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1 text-xs text-ink-2" title={`Compared with the ${RANGE_LABEL[range]}`}>
      <Icon className="size-3.5" aria-hidden />
      <span className="num">
        {up ? "+" : ""}
        {value.toFixed(1)}%
      </span>
      <span className="sr-only">compared with the {RANGE_LABEL[range]}</span>
    </span>
  );
}

function KpiStrip({ data }: { data: Dashboard }) {
  const k = data.kpis;
  const items = [
    { label: "Sales", value: money(k.revenue.value), change: k.revenue.change },
    { label: "Orders", value: count(k.orders.value), change: k.orders.change },
    { label: "Units sold", value: count(k.unitsSold.value), change: k.unitsSold.change },
    { label: "Stock purchased", value: money(k.purchases.value), change: k.purchases.change },
    { label: "Expenses", value: money(k.expenses.value), change: k.expenses.change },
    { label: "Profit", value: money(k.profit.value), change: k.profit.change },
  ];
  return (
    <section
      aria-label="Key numbers"
      className="grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-panel sm:grid-cols-3 xl:grid-cols-6"
    >
      {items.map((it, i) => (
        <div
          key={it.label}
          className={cx(
            "flex flex-col gap-1 border-line px-5 py-4",
            i % 2 === 1 && "border-l",
            i >= 2 && "border-t",
            "sm:border-l-0 sm:border-t-0",
            i % 3 !== 0 && "sm:border-l",
            i >= 3 && "sm:border-t",
            "xl:border-t-0",
            i > 0 && "xl:border-l",
          )}
        >
          <span className="text-[13px] text-ink-2">{it.label}</span>
          <span className={cx("num font-display text-2xl font-semibold", it.label === "Profit" && data.kpis.profit.value < 0 && "text-danger")}>
            {it.value}
          </span>
          <Change value={it.change} range={data.range} />
        </div>
      ))}
    </section>
  );
}

function Restock({ data }: { data: Dashboard }) {
  const dispatch = useAppDispatch();
  const { lowStockCount, outOfStockCount } = data.inventory;
  const total = lowStockCount + outOfStockCount;

  return (
    <Panel
      className="lg:col-span-2"
      title={total ? `${total} ${total === 1 ? "product needs" : "products need"} restocking` : "Stock levels are healthy"}
      action={
        total > 6 ? (
          <Link href="/products/?status=low" className="text-sm font-medium text-accent hover:underline">
            See all
          </Link>
        ) : null
      }
    >
      {total === 0 ? (
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <CheckCircle2 className="size-4 text-accent" aria-hidden /> Everything is above its reorder level.
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-2">
            {outOfStockCount > 0 && <span className="font-medium text-danger">{outOfStockCount} sold out</span>}
            {outOfStockCount > 0 && lowStockCount > 0 && ", "}
            {lowStockCount > 0 && <span className="font-medium text-warn">{lowStockCount} at or below reorder level</span>}
          </p>
          <ul className="divide-y divide-line">
            {data.lowStock.map((p) => (
              <li key={p.productId} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                <button className="min-w-0 text-left" onClick={() => dispatch(openProduct(p.productId))}>
                  <div className="truncate text-sm font-medium hover:underline">{p.name}</div>
                  <div className="text-xs text-ink-3">
                    {p.sku ? `${p.sku}, ` : ""}reorder at {count(p.reorderLevel)}
                  </div>
                </button>
                <StockGauge stock={p.stockQuantity} reorderLevel={p.reorderLevel} className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" />
                <Button
                  size="sm"
                  className="col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto"
                  onClick={() => dispatch(openDialog({ kind: "purchase", productId: p.productId }))}
                >
                  <ArrowDownToLine className="size-3.5" aria-hidden />
                  Receive
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function InventorySnapshot({ data }: { data: Dashboard }) {
  const inv = data.inventory;
  return (
    <Panel title="On the shelf">
      <p className="text-[13px] text-ink-2">Stock value at selling price</p>
      <p className="num font-display text-4xl font-semibold tracking-tight">{money(inv.value)}</p>
      <dl className="mt-5 grid grid-cols-2 gap-y-2 text-sm">
        <dt className="text-ink-2">Units in stock</dt>
        <dd className="num text-right font-medium">{count(inv.units)}</dd>
        <dt className="text-ink-2">Active products</dt>
        <dd className="num text-right font-medium">{count(inv.products)}</dd>
        <dt className="text-ink-2">Low stock</dt>
        <dd className="num text-right font-medium text-warn">{count(inv.lowStockCount)}</dd>
        <dt className="text-ink-2">Sold out</dt>
        <dd className="num text-right font-medium text-danger">{count(inv.outOfStockCount)}</dd>
      </dl>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <Skeleton className="h-28" />
      <Skeleton className="h-96" />
    </div>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("30d");
  const { data, isLoading, isFetching, error, refetch } = useGetDashboardQuery(range);
  const dispatch = useAppDispatch();

  return (
    <>
      <PageHeader
        title="Overview"
        description="What needs restocking, and how sales are going."
        actions={
          <Segmented
            label="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: "7d", label: "7 days" },
              { value: "30d", label: "30 days" },
              { value: "90d", label: "90 days" },
              { value: "12m", label: "12 months" },
            ]}
          />
        }
      />

      {isLoading && <DashboardSkeleton />}
      {error && !data && <ErrorState message={errorMessage(error)} onRetry={refetch} />}

      {data && (
        <div className={cx("flex flex-col gap-6 transition-opacity", isFetching && "opacity-60")}>
          <div className="grid gap-6 lg:grid-cols-3">
            <Restock data={data} />
            <InventorySnapshot data={data} />
          </div>

          <KpiStrip data={data} />

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel title="Sales and stock purchased" className="lg:col-span-2">
              <SalesChart data={data} />
            </Panel>
            <Panel title="Best sellers">
              {data.topProducts.length === 0 ? (
                <p className="text-sm text-ink-2">No sales in this period.</p>
              ) : (
                <RankedBars
                  rows={data.topProducts.map((p) => ({
                    key: p.productId,
                    label: p.name ?? "Unknown product",
                    sub: `${count(p.units)} sold`,
                    value: p.revenue,
                  }))}
                  onSelect={(id) => dispatch(openProduct(id))}
                />
              )}
            </Panel>
          </div>

          <Panel title="Where the money went">
            {data.expenseByCategory.length === 0 ? (
              <p className="text-sm text-ink-2">No expenses in this period.</p>
            ) : (
              <div className="max-w-2xl">
                <RankedBars
                  rows={data.expenseByCategory.map((e) => ({ key: e.category, label: e.category, value: e.amount }))}
                />
              </div>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
