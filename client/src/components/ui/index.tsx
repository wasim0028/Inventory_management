"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { count, stockStatus } from "@/lib/format";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ----------------------------- Buttons ----------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  secondary: "bg-panel text-ink border border-line-strong hover:bg-panel-2",
  ghost: "text-ink-2 hover:text-ink hover:bg-panel-2",
  danger: "bg-danger-soft text-danger hover:brightness-95",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; loading?: boolean }
>(function Button({ variant = "secondary", size = "md", loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
        size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm",
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-panel-2 hover:text-ink transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ------------------------------ Inputs ----------------------------- */

const fieldBase =
  "w-full rounded-lg border border-line-strong bg-panel px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cx(fieldBase, "h-10", className)} {...props} />;
});

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(fieldBase, "py-2 min-h-20", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="text-[13px] text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/* ------------------------------ Modal ------------------------------ */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-panel p-0 text-ink shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]",
        width,
        open && "animate-rise",
      )}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div>
              <h2 className="font-display text-xl font-semibold">{title}</h2>
              {description && <p className="mt-1 text-sm text-ink-2">{description}</p>}
            </div>
            <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
              <X className="size-5" />
            </IconButton>
          </div>
          <div className="overflow-y-auto px-6 pb-5">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-line bg-panel-2 px-6 py-3 rounded-b-2xl">{footer}</div>
          )}
        </div>
      )}
    </dialog>
  );
}

/* ---------------------------- Stock bits --------------------------- */

const statusText = { out: "Out of stock", low: "Low stock", ok: "In stock" } as const;

export function StockBadge({ stock, reorderLevel }: { stock: number; reorderLevel: number }) {
  const s = stockStatus(stock, reorderLevel);
  if (s === "ok") return null;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        s === "out" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
      )}
    >
      <AlertTriangle className="size-3" aria-hidden />
      {statusText[s]}
    </span>
  );
}

/**
 * Stock level against its reorder point. The bar scale is 3x the reorder level,
 * so the tick (the reorder point) always sits a third of the way along and a
 * glance down a column shows which products are close to it.
 */
export function StockGauge({
  stock,
  reorderLevel,
  className,
}: {
  stock: number;
  reorderLevel: number;
  className?: string;
}) {
  const s = stockStatus(stock, reorderLevel);
  const scale = Math.max(reorderLevel * 3, 1);
  const pct = Math.min(100, (stock / scale) * 100);
  return (
    <div className={cx("flex items-center gap-3", className)}>
      <span
        className={cx(
          "num w-14 shrink-0 text-right text-sm font-medium",
          s === "out" ? "text-danger" : s === "low" ? "text-warn" : "text-ink",
        )}
      >
        {count(stock)}
      </span>
      <div
        className="relative h-2 w-full min-w-16 rounded-full bg-line"
        role="img"
        aria-label={`${count(stock)} in stock, reorder at ${count(reorderLevel)}. ${statusText[s]}.`}
      >
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-full",
            s === "ok" ? "bg-ok-bar" : s === "low" ? "bg-warn-bar" : "bg-danger",
          )}
          style={{ width: `${s === "out" ? 0 : Math.max(pct, 3)}%` }}
        />
        <div className="absolute -top-1 -bottom-1 left-1/3 w-0.5 rounded bg-ink-3" title={`Reorder at ${reorderLevel}`} />
      </div>
    </div>
  );
}

/* ---------------------------- Page chrome -------------------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1 max-w-[60ch] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cx("rounded-xl border border-line bg-panel", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
          {title && <h2 className="font-display text-lg font-semibold">{title}</h2>}
          {action}
        </header>
      )}
      <div className={cx("px-5 pb-5", !title && !action && "pt-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string; count?: number }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors",
            value === o.value ? "bg-panel text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:text-ink",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="num text-ink-3">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-2">
      <span className="num">
        {count(from)}–{count(to)} of {count(total)}
      </span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-40">
          <ChevronLeft className="size-4" />
        </IconButton>
        <span className="num px-1">
          Page {page} of {pageCount}
        </span>
        <IconButton
          label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          className="disabled:opacity-40"
        >
          <ChevronRight className="size-4" />
        </IconButton>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {body && <p className="mt-1 max-w-[46ch] text-sm text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-12 text-center">
      <p className="font-medium text-danger">{message}</p>
      {onRetry && (
        <Button size="sm" className="mt-3" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-md bg-line/70", className)} />;
}

/* ------------------------------ Table ------------------------------ */

export function Th({
  children,
  className,
  sort,
}: {
  children?: ReactNode;
  className?: string;
  sort?: { active: boolean; order: "asc" | "desc"; onClick: () => void };
}) {
  return (
    <th
      scope="col"
      aria-sort={sort?.active ? (sort.order === "asc" ? "ascending" : "descending") : undefined}
      className={cx("whitespace-nowrap px-4 py-2.5 text-left text-[13px] font-medium text-ink-2", className)}
    >
      {sort ? (
        <button onClick={sort.onClick} className="inline-flex items-center gap-1 hover:text-ink">
          {children}
          <span aria-hidden className={cx("text-[10px]", !sort.active && "opacity-0")}>
            {sort.order === "asc" ? "▲" : "▼"}
          </span>
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cx("px-4 py-3 align-middle", className)}>{children}</td>;
}

export function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-line [&_tbody_tr:hover]:bg-panel-2">
        {children}
      </table>
    </div>
  );
}

export function SkeletonRows({ cols, rows = 8 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i}>
          {Array.from({ length: cols }, (_, j) => (
            <td key={j} className="px-4 py-3.5">
              <Skeleton className="h-4 w-full max-w-40" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
