"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, Boxes, PackagePlus, Receipt, Search, ShoppingCart, User } from "lucide-react";
import { useSearchQuery } from "@/state/api";
import { openDialog, openProduct, setSearchOpen, useAppDispatch, useAppSelector } from "@/state/store";
import { useDebounced } from "@/lib/hooks";
import { count, date, money } from "@/lib/format";
import { cx, StockBadge } from "./ui";

interface Item {
  id: string;
  group: string;
  title: string;
  meta?: string;
  icon: typeof Search;
  badge?: React.ReactNode;
  run: () => void;
}

/**
 * Global search (Ctrl/Cmd+K): finds products, people and expenses on the server,
 * plus quick actions. Arrow keys move, Enter opens.
 */
export function CommandPalette() {
  const open = useAppSelector((s) => s.ui.searchOpen);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(q.trim(), 200);
  const { data, isFetching } = useSearchQuery(debounced, { skip: !open || debounced.length < 1 });

  const close = () => dispatch(setSearchOpen(false));

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "a-sale", group: "Actions", title: "Record a sale", icon: ShoppingCart, run: () => dispatch(openDialog({ kind: "sale" })) },
      { id: "a-recv", group: "Actions", title: "Receive stock", icon: ArrowDownToLine, run: () => dispatch(openDialog({ kind: "purchase" })) },
      { id: "a-prod", group: "Actions", title: "Add a product", icon: PackagePlus, run: () => dispatch(openDialog({ kind: "product" })) },
      { id: "a-exp", group: "Actions", title: "Add an expense", icon: Receipt, run: () => dispatch(openDialog({ kind: "expense" })) },
    ];
    const term = q.trim().toLowerCase();
    const matchedActions = term ? actions.filter((a) => a.title.toLowerCase().includes(term)) : actions;
    if (!data || !term) return matchedActions;

    const go = (path: string) => () => {
      close();
      router.push(path);
    };
    return [
      ...data.products.map<Item>((p) => ({
        id: `p-${p.productId}`,
        group: "Products",
        title: p.name,
        meta: [p.sku, p.category, `${count(p.stockQuantity)} in stock`].filter(Boolean).join(", "),
        icon: Boxes,
        badge: <StockBadge stock={p.stockQuantity} reorderLevel={p.reorderLevel} />,
        run: () => dispatch(openProduct(p.productId)),
      })),
      ...data.users.map<Item>((u) => ({
        id: `u-${u.userId}`,
        group: "People",
        title: u.name,
        meta: u.email,
        icon: User,
        run: go(`/team/?q=${encodeURIComponent(u.name)}`),
      })),
      ...data.expenses.map<Item>((e) => ({
        id: `e-${e.expenseId}`,
        group: "Expenses",
        title: `${e.category}: ${money(e.amount)}`,
        meta: [e.description, date(e.timestamp)].filter(Boolean).join(", "),
        icon: Receipt,
        run: go(`/expenses/?q=${encodeURIComponent(e.category)}`),
      })),
      ...matchedActions,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, q, dispatch, router]);

  useEffect(() => setActive(0), [items.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      items[active].run();
    }
  };

  useEffect(() => {
    document.getElementById(`cmd-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const noResults =
    q.trim() && data && !isFetching && data.products.length + data.users.length + data.expenses.length === 0;

  let lastGroup = "";
  return (
    <dialog
      ref={dialogRef}
      onClose={close}
      onClick={(e) => e.target === dialogRef.current && close()}
      aria-label="Search"
      className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl rounded-2xl border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/40"
    >
      {open && (
        <div onKeyDown={onKeyDown}>
          <div className="flex items-center gap-3 border-b border-line px-4">
            <Search className="size-5 text-ink-3" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, SKUs, people, expenses"
              className="h-14 flex-1 bg-transparent text-base outline-none focus-visible:outline-none placeholder:text-ink-3"
              role="combobox"
              aria-expanded
              aria-controls="cmd-list"
              aria-activedescendant={items[active] ? `cmd-${active}` : undefined}
            />
            {isFetching && <span className="text-xs text-ink-3">Searching</span>}
          </div>
          <ul id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
            {noResults && <li className="px-3 py-6 text-center text-sm text-ink-2">Nothing matches “{q.trim()}”.</li>}
            {items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const Icon = item.icon;
              return (
                <li key={item.id} role="presentation">
                  {header && <div className="px-3 pt-3 pb-1 text-xs font-medium text-ink-3">{header}</div>}
                  <div
                    id={`cmd-${i}`}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => item.run()}
                    className={cx(
                      "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                      i === active && "bg-accent-soft",
                    )}
                  >
                    <Icon className={cx("size-4 shrink-0", i === active ? "text-accent" : "text-ink-3")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{item.title}</div>
                      {item.meta && <div className="truncate text-xs text-ink-2">{item.meta}</div>}
                    </div>
                    {item.badge}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-4 border-t border-line px-4 py-2 text-xs text-ink-3">
            <span>↑↓ to move</span>
            <span>Enter to open</span>
            <span>Esc to close</span>
          </div>
        </div>
      )}
    </dialog>
  );
}
