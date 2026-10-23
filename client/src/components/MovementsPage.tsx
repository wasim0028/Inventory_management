"use client";

import { Plus, Search } from "lucide-react";
import { useGetPurchasesQuery, useGetSalesQuery } from "@/state/api";
import { openDialog, openProduct, useAppDispatch } from "@/state/store";
import { useSearchBox, useUrlState } from "@/lib/useUrlState";
import { count, dateTime, errorMessage, money, moneyExact } from "@/lib/format";
import {
  Button,
  cx,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  SkeletonRows,
  TableShell,
  Td,
  Th,
} from "./ui";

interface Row {
  id: string;
  at: string;
  productId: string;
  product: string;
  sku?: string | null;
  quantity: number;
  unit: number;
  total: number;
  extra: string | null;
}

/** Shared list for Sales and Stock received. */
export function MovementsPage({ kind }: { kind: "sale" | "purchase" }) {
  const isSale = kind === "sale";
  const dispatch = useAppDispatch();
  const [s, set] = useUrlState({ q: "", page: "1" });
  const [search, setSearch] = useSearchBox(s.q, set);
  const params = { q: s.q, page: Number(s.page) || 1, pageSize: 20 };

  const sales = useGetSalesQuery(params, { skip: !isSale });
  const purchases = useGetPurchasesQuery(params, { skip: isSale });
  const { isLoading, isFetching, error, refetch } = isSale ? sales : purchases;

  const page = isSale ? sales.data : purchases.data;
  const rows: Row[] | undefined = isSale
    ? sales.data?.items.map((x) => ({
        id: x.saleId,
        at: x.timestamp,
        productId: x.productId,
        product: x.product?.name ?? "",
        sku: x.product?.sku,
        quantity: x.quantity,
        unit: x.unitPrice,
        total: x.totalAmount,
        extra: x.note,
      }))
    : purchases.data?.items.map((x) => ({
        id: x.purchaseId,
        at: x.timestamp,
        productId: x.productId,
        product: x.product?.name ?? "",
        sku: x.product?.sku,
        quantity: x.quantity,
        unit: x.unitCost,
        total: x.totalCost,
        extra: x.supplier,
      }));

  const pageTotal = rows?.reduce((sum, r) => sum + r.total, 0) ?? 0;
  const action = isSale ? "Record sale" : "Receive stock";

  return (
    <>
      <PageHeader
        title={isSale ? "Sales" : "Stock received"}
        description={
          isSale
            ? "Every sale, newest first. Recording a sale takes it out of stock."
            : "Deliveries from suppliers, newest first. Receiving stock adds it to the shelf."
        }
        actions={
          <Button variant="primary" onClick={() => dispatch(openDialog({ kind }))}>
            <Plus className="size-4" aria-hidden /> {action}
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            type="search"
            aria-label={isSale ? "Search sales" : "Search deliveries"}
            placeholder={isSale ? "Product name" : "Product or supplier"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {page && page.total > 0 && (
          <p className="num text-sm text-ink-2">
            {count(page.total)} {isSale ? "sales" : "deliveries"}, {money(pageTotal)} on this page
          </p>
        )}
      </div>

      <div className={cx("overflow-hidden rounded-xl border border-line bg-panel", isFetching && !isLoading && "opacity-70")}>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Product</Th>
                  <Th className="text-right">Quantity</Th>
                  <Th className="text-right">{isSale ? "Unit price" : "Unit cost"}</Th>
                  <Th className="text-right">Total</Th>
                  <Th>{isSale ? "Note" : "Supplier"}</Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={6} />}
                {rows?.map((r) => (
                  <tr key={r.id}>
                    <Td className="whitespace-nowrap text-ink-2">{dateTime(r.at)}</Td>
                    <Td>
                      <button className="text-left font-medium hover:underline" onClick={() => dispatch(openProduct(r.productId))}>
                        {r.product}
                      </button>
                      {r.sku && <div className="text-xs text-ink-3">{r.sku}</div>}
                    </Td>
                    <Td className="num text-right">
                      {isSale ? "−" : "+"}
                      {count(r.quantity)}
                    </Td>
                    <Td className="num text-right text-ink-2">{moneyExact(r.unit)}</Td>
                    <Td className="num text-right font-medium">{moneyExact(r.total)}</Td>
                    <Td className="max-w-56 truncate text-ink-2">{r.extra ?? ""}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            {page && page.total === 0 && (
              <EmptyState
                title={s.q ? `Nothing matches “${s.q}”` : isSale ? "No sales yet" : "No deliveries yet"}
                body={s.q ? "Try a different product name." : undefined}
                action={
                  <Button variant="primary" onClick={() => dispatch(openDialog({ kind }))}>
                    {action}
                  </Button>
                }
              />
            )}
            {page && (
              <Pagination
                page={page.page}
                pageCount={page.pageCount}
                total={page.total}
                pageSize={page.pageSize}
                onPage={(p) => set({ page: String(p) })}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
