"use client";

import { Suspense } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useDeleteExpenseMutation, useGetExpensesByCategoryQuery, useGetExpensesQuery } from "@/state/api";
import { openDialog, useAppDispatch } from "@/state/store";
import { useIsAdmin } from "@/lib/hooks";
import { useSearchBox, useUrlState } from "@/lib/useUrlState";
import { date, errorMessage, money, moneyExact } from "@/lib/format";
import { RankedBars } from "@/components/charts";
import {
  Button,
  cx,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  PageHeader,
  Pagination,
  Panel,
  Skeleton,
  SkeletonRows,
  TableShell,
  Td,
  Th,
} from "@/components/ui";

function ExpensesView() {
  const dispatch = useAppDispatch();
  const isAdmin = useIsAdmin();
  const [s, set] = useUrlState({ q: "", category: "", page: "1" });
  const [search, setSearch] = useSearchBox(s.q, set);
  const { data, isLoading, isFetching, error, refetch } = useGetExpensesQuery({
    q: s.q,
    category: s.category,
    page: Number(s.page) || 1,
    pageSize: 20,
  });
  const { data: byCategory, isLoading: catLoading } = useGetExpensesByCategoryQuery();
  const [remove] = useDeleteExpenseMutation();
  const grand = byCategory?.reduce((sum, c) => sum + c.amount, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Running costs outside of stock purchases."
        actions={
          <Button variant="primary" onClick={() => dispatch(openDialog({ kind: "expense" }))}>
            <Plus className="size-4" aria-hidden /> Add expense
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
              <Input
                type="search"
                aria-label="Search expenses"
                placeholder="Category or description"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {s.category && (
              <Button size="sm" variant="ghost" onClick={() => set({ category: "" })}>
                Showing {s.category} only. Show all
              </Button>
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
                      <Th>Date</Th>
                      <Th>Category</Th>
                      <Th>Description</Th>
                      <Th className="text-right">Amount</Th>
                      {isAdmin && (
                        <Th className="w-0">
                          <span className="sr-only">Actions</span>
                        </Th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && <SkeletonRows cols={isAdmin ? 5 : 4} />}
                    {data?.items.map((e) => (
                      <tr key={e.expenseId}>
                        <Td className="whitespace-nowrap text-ink-2">{date(e.timestamp)}</Td>
                        <Td className="font-medium">{e.category}</Td>
                        <Td className="max-w-64 truncate text-ink-2">{e.description ?? ""}</Td>
                        <Td className="num text-right font-medium">{moneyExact(e.amount)}</Td>
                        {isAdmin && (
                          <Td>
                            <IconButton
                              label={`Delete ${e.category} expense`}
                              onClick={async () => {
                                if (!confirm(`Delete this ${e.category} expense of ${moneyExact(e.amount)}?`)) return;
                                try {
                                  await remove(e.expenseId).unwrap();
                                  toast.success("Expense deleted");
                                } catch (err) {
                                  toast.error(errorMessage(err));
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </IconButton>
                          </Td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
                {data && data.total === 0 && (
                  <EmptyState
                    title={s.q || s.category ? "No expenses match" : "No expenses yet"}
                    action={
                      <Button variant="primary" onClick={() => dispatch(openDialog({ kind: "expense" }))}>
                        Add expense
                      </Button>
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
        </div>

        <Panel title="By category, all time">
          {catLoading ? (
            <Skeleton className="h-48" />
          ) : (
            <>
              <p className="num mb-4 font-display text-3xl font-semibold">{money(grand)}</p>
              <RankedBars
                rows={(byCategory ?? []).map((c) => ({ key: c.category, label: c.category, value: c.amount }))}
                onSelect={(category) => set({ category })}
              />
              <p className="mt-4 text-xs text-ink-3">Select a category to filter the list.</p>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

export default function ExpensesPage() {
  return (
    <Suspense>
      <ExpensesView />
    </Suspense>
  );
}
