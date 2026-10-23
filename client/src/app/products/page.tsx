"use client";

import { Suspense } from "react";
import { ArrowDownToLine, Plus, RotateCcw, Search, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  useGetCategoriesQuery,
  useGetDashboardQuery,
  useGetProductsQuery,
  useRestoreProductMutation,
  type ProductQuery,
} from "@/state/api";
import { openDialog, openProduct, useAppDispatch } from "@/state/store";
import { useIsAdmin } from "@/lib/hooks";
import { useSearchBox, useUrlState } from "@/lib/useUrlState";
import { errorMessage, moneyExact } from "@/lib/format";
import {
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Segmented,
  Select,
  SkeletonRows,
  StockGauge,
  TableShell,
  Td,
  Th,
  cx,
} from "@/components/ui";

type Status = NonNullable<ProductQuery["status"]>;
type Sort = NonNullable<ProductQuery["sort"]>;

function ProductsView() {
  const dispatch = useAppDispatch();
  const isAdmin = useIsAdmin();
  const [s, set] = useUrlState({ q: "", status: "all", category: "", sort: "name", order: "asc", page: "1" });
  const [search, setSearch] = useSearchBox(s.q, set);

  const query: ProductQuery = {
    q: s.q,
    status: s.status as Status,
    category: s.category,
    sort: s.sort as Sort,
    order: s.order as "asc" | "desc",
    page: Number(s.page) || 1,
    pageSize: 15,
  };
  const { data, isLoading, isFetching, error, refetch } = useGetProductsQuery(query);
  const { data: categories } = useGetCategoriesQuery();
  const { data: dash } = useGetDashboardQuery("30d");
  const [restore] = useRestoreProductMutation();

  const sortBy = (col: Sort) => ({
    active: s.sort === col,
    order: (s.sort === col ? s.order : "asc") as "asc" | "desc",
    onClick: () => set({ sort: col, order: s.sort === col && s.order === "asc" ? "desc" : "asc" }),
  });

  const archived = s.status === "archived";
  const filtered = Boolean(s.q || s.category || s.status !== "all");

  return (
    <>
      <PageHeader
        title="Products"
        description="Everything you stock, with live quantities against each reorder level."
        actions={
          <Button variant="primary" onClick={() => dispatch(openDialog({ kind: "product" }))}>
            <Plus className="size-4" aria-hidden /> Add product
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <Input
            type="search"
            aria-label="Search products"
            placeholder="Name, SKU or category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Segmented<Status>
          label="Stock status"
          value={s.status as Status}
          onChange={(v) => set({ status: v })}
          options={[
            { value: "all", label: "All" },
            { value: "in", label: "In stock" },
            { value: "low", label: "Low", count: dash?.inventory.lowStockCount },
            { value: "out", label: "Sold out", count: dash?.inventory.outOfStockCount },
            { value: "archived", label: "Archived" },
          ]}
        />
        <div className="w-full sm:w-56">
        <Select aria-label="Category" value={s.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">All categories</option>
          {categories?.map((c) => (
            <option key={c.category} value={c.category}>
              {c.category} ({c.count})
            </option>
          ))}
        </Select>
        </div>
      </div>

      <div className={cx("overflow-hidden rounded-xl border border-line bg-panel", isFetching && !isLoading && "opacity-70")}>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={refetch} />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <Th sort={sortBy("name")}>Product</Th>
                  <Th>Category</Th>
                  <Th sort={sortBy("price")} className="text-right">
                    Price
                  </Th>
                  <Th sort={sortBy("stockQuantity")} className="w-[30%] min-w-56">
                    In stock
                  </Th>
                  <Th sort={sortBy("rating")} className="text-right">
                    Rating
                  </Th>
                  <Th className="w-0">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <SkeletonRows cols={6} />}
                {data?.items.map((p) => (
                  <tr key={p.productId} className="cursor-pointer" onClick={() => dispatch(openProduct(p.productId))}>
                    <Td>
                      <button className="text-left font-medium hover:underline" onClick={() => dispatch(openProduct(p.productId))}>
                        {p.name}
                      </button>
                      {p.sku && <div className="text-xs text-ink-3">{p.sku}</div>}
                    </Td>
                    <Td className="text-ink-2">{p.category}</Td>
                    <Td className="num text-right">{moneyExact(p.price)}</Td>
                    <Td>
                      <StockGauge stock={p.stockQuantity} reorderLevel={p.reorderLevel} />
                    </Td>
                    <Td className="num text-right text-ink-2">{p.rating != null ? p.rating.toFixed(1) : "–"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {archived ? (
                          isAdmin && (
                            <Button
                              size="sm"
                              onClick={async () => {
                                try {
                                  await restore(p.productId).unwrap();
                                  toast.success(`Restored ${p.name}`);
                                } catch (err) {
                                  toast.error(errorMessage(err));
                                }
                              }}
                            >
                              <RotateCcw className="size-3.5" aria-hidden /> Restore
                            </Button>
                          )
                        ) : (
                          <>
                            <IconButton
                              label={`Sell ${p.name}`}
                              disabled={p.stockQuantity === 0}
                              className="disabled:opacity-30"
                              onClick={() => dispatch(openDialog({ kind: "sale", productId: p.productId }))}
                            >
                              <ShoppingCart className="size-4" />
                            </IconButton>
                            <IconButton
                              label={`Receive stock for ${p.name}`}
                              onClick={() => dispatch(openDialog({ kind: "purchase", productId: p.productId }))}
                            >
                              <ArrowDownToLine className="size-4" />
                            </IconButton>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            {data && data.total === 0 && (
              <EmptyState
                title={filtered ? "No products match these filters" : "No products yet"}
                body={filtered ? "Try a different search or clear the filters." : "Add your first product to start tracking stock."}
                action={
                  filtered ? (
                    <Button
                      onClick={() => {
                        setSearch("");
                        set({ q: "", status: "all", category: "" });
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <Button variant="primary" onClick={() => dispatch(openDialog({ kind: "product" }))}>
                      Add product
                    </Button>
                  )
                }
              />
            )}
            {data && (
              <Pagination
                page={data.page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={data.pageSize}
                onPage={(p) => set({ page: String(p) })}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

export default function ProductsPage() {
  return (
    <Suspense>
      <ProductsView />
    </Suspense>
  );
}
