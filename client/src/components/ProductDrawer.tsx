"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ArrowDownToLine, Pencil, ShoppingCart, X } from "lucide-react";
import { useArchiveProductMutation, useGetProductQuery } from "@/state/api";
import { openDialog, openProduct, useAppDispatch, useAppSelector } from "@/state/store";
import { count, dateTime, errorMessage, money, moneyExact } from "@/lib/format";
import { useIsAdmin } from "@/lib/hooks";
import { Button, ErrorState, IconButton, Skeleton, StockBadge, StockGauge } from "./ui";

/** Side panel with a product's numbers and its latest stock movements. */
export function ProductDrawer() {
  const id = useAppSelector((s) => s.ui.drawerProductId);
  const dispatch = useAppDispatch();
  const ref = useRef<HTMLDialogElement>(null);
  const isAdmin = useIsAdmin();
  const { data: p, isLoading, isError, refetch } = useGetProductQuery(id!, { skip: !id });
  const [archive, { isLoading: archiving }] = useArchiveProductMutation();
  const close = () => dispatch(openProduct(null));

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (id && !d.open) d.showModal();
    if (!id && d.open) d.close();
  }, [id]);

  // Merge sales and deliveries into one timeline, newest first.
  const movements = p
    ? [
        ...p.Sales.map((s) => ({ key: s.saleId, at: s.timestamp, qty: -s.quantity, label: s.note || "Sale", amount: s.totalAmount })),
        ...p.Purchases.map((x) => ({ key: x.purchaseId, at: x.timestamp, qty: x.quantity, label: x.supplier || "Delivery", amount: x.totalCost })),
      ]
        .sort((a, b) => +new Date(b.at) - +new Date(a.at))
        .slice(0, 12)
    : [];

  async function onArchive() {
    if (!p || !confirm(`Archive ${p.name}? It will be hidden from lists but its history is kept.`)) return;
    try {
      await archive(p.productId).unwrap();
      toast.success(`Archived ${p.name}`);
      close();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => e.target === ref.current && close()}
      aria-label={p?.name ?? "Product"}
      className="ml-auto mr-0 h-dvh max-h-dvh w-full max-w-md border-l border-line bg-panel p-0 text-ink backdrop:bg-black/30"
    >
      {id && (
        <div className="animate-slide-in flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-line px-6 py-5">
            {isLoading ? (
              <Skeleton className="h-7 w-48" />
            ) : (
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-semibold leading-tight">{p?.name}</h2>
                <p className="mt-1 text-sm text-ink-2">{[p?.sku, p?.category].filter(Boolean).join(", ")}</p>
              </div>
            )}
            <IconButton label="Close" onClick={close} className="-mr-2">
              <X className="size-5" />
            </IconButton>
          </div>

          {isError && <ErrorState message="Couldn't load this product." onRetry={refetch} />}

          {p && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-2">Stock on hand</span>
                <StockBadge stock={p.stockQuantity} reorderLevel={p.reorderLevel} />
              </div>
              <StockGauge stock={p.stockQuantity} reorderLevel={p.reorderLevel} className="mt-2 [&>span]:w-auto [&>span]:text-2xl [&>span]:font-display" />
              <p className="mt-1 text-[13px] text-ink-3">Reorder at {count(p.reorderLevel)}</p>

              <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <dt className="text-ink-2">Selling price</dt>
                <dd className="num text-right font-medium">{moneyExact(p.price)}</dd>
                <dt className="text-ink-2">Stock value</dt>
                <dd className="num text-right font-medium">{money(p.price * p.stockQuantity)}</dd>
                <dt className="text-ink-2">Rating</dt>
                <dd className="num text-right font-medium">{p.rating != null ? `${p.rating.toFixed(1)} / 5` : "None"}</dd>
              </dl>

              <div className="mt-6 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={() => dispatch(openDialog({ kind: "sale", productId: p.productId }))} disabled={p.stockQuantity === 0}>
                  <ShoppingCart className="size-4" aria-hidden /> Sell
                </Button>
                <Button onClick={() => dispatch(openDialog({ kind: "purchase", productId: p.productId }))}>
                  <ArrowDownToLine className="size-4" aria-hidden /> Receive
                </Button>
              </div>

              <h3 className="mt-8 font-display text-base font-semibold">Recent movements</h3>
              {movements.length === 0 ? (
                <p className="mt-2 text-sm text-ink-2">No sales or deliveries yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-line">
                  {movements.map((m) => (
                    <li key={m.key} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate">{m.label}</div>
                        <div className="text-xs text-ink-3">{dateTime(m.at)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`num font-medium ${m.qty > 0 ? "text-accent" : ""}`}>
                          {m.qty > 0 ? "+" : "−"}
                          {count(Math.abs(m.qty))}
                        </div>
                        <div className="num text-xs text-ink-3">{money(m.amount)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {p && (
            <div className="flex justify-between gap-2 border-t border-line px-6 py-4">
              {isAdmin ? (
                <Button variant="danger" size="sm" onClick={onArchive} loading={archiving}>
                  Archive
                </Button>
              ) : (
                <span />
              )}
              <Button size="sm" onClick={() => dispatch(openDialog({ kind: "product", productId: p.productId }))}>
                <Pencil className="size-3.5" aria-hidden /> Edit details
              </Button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
