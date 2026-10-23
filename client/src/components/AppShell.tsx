"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Boxes,
  LayoutDashboard,
  Leaf,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Search,
  Settings,
  ShoppingCart,
  Users,
  X,
} from "lucide-react";
import { APP_NAME } from "@/lib/config";
import {
  openDialog,
  setMobileNav,
  setSearchOpen,
  toggleSidebar,
  useAppDispatch,
  useAppSelector,
} from "@/state/store";
import { useGetDashboardQuery } from "@/state/api";
import { cx, IconButton } from "./ui";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/products/", label: "Products", icon: Boxes },
  { href: "/sales/", label: "Sales", icon: ShoppingCart },
  { href: "/purchases/", label: "Stock received", icon: ArrowDownToLine },
  { href: "/expenses/", label: "Expenses", icon: Receipt },
  { href: "/team/", label: "Team", icon: Users },
  { href: "/settings/", label: "Settings", icon: Settings },
];

function NavLinks({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  // Badge on Products: how many need restocking (shares the dashboard's cached query).
  const { data } = useGetDashboardQuery("30d");
  const attention = data ? data.inventory.lowStockCount + data.inventory.outOfStockCount : 0;

  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon }) => {
        const norm = (p: string) => p.replace(/\/$/, "") || "/";
        const active = norm(pathname) === norm(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            title={collapsed ? label : undefined}
            className={cx(
              "group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-panel-2 hover:text-ink",
              collapsed && "justify-center px-0",
            )}
          >
            <Icon className="size-[18px] shrink-0" aria-hidden />
            {!collapsed && <span className="flex-1">{label}</span>}
            {href === "/products/" && attention > 0 && (
              <span
                className={cx(
                  "num rounded-full bg-warn-soft px-1.5 text-xs font-semibold text-warn",
                  collapsed && "absolute -right-1 -top-1",
                )}
                aria-label={`${attention} need restocking`}
              >
                {attention}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className={cx("flex items-center gap-2 px-3 text-accent", collapsed && "justify-center px-0")}>
      <Leaf className="size-6 shrink-0" aria-hidden />
      {!collapsed && <span className="font-display text-lg font-semibold text-ink">{APP_NAME}</span>}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useAppSelector((s) => s.ui.mobileNavOpen);

  // Ctrl/Cmd+K opens search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch(setSearchOpen(true));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dispatch]);

  return (
    <div className="min-h-dvh">
      {/* Desktop sidebar */}
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-line bg-panel py-5 transition-[width] md:flex",
          collapsed ? "w-[72px] px-3" : "w-60 px-3",
        )}
      >
        <Brand collapsed={collapsed} />
        <div className="mt-8 flex-1">
          <NavLinks collapsed={collapsed} />
        </div>
        <IconButton
          label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => dispatch(toggleSidebar())}
          className={cx(!collapsed && "ml-1")}
        >
          {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
        </IconButton>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => dispatch(setMobileNav(false))} />
          <aside className="animate-rise absolute inset-y-0 left-0 flex w-72 flex-col bg-panel px-3 py-5 shadow-xl">
            <div className="flex items-center justify-between">
              <Brand />
              <IconButton label="Close menu" onClick={() => dispatch(setMobileNav(false))}>
                <X className="size-5" />
              </IconButton>
            </div>
            <div className="mt-8">
              <NavLinks collapsed={false} onNavigate={() => dispatch(setMobileNav(false))} />
            </div>
          </aside>
        </div>
      )}

      <div className={cx("transition-[padding]", collapsed ? "md:pl-[72px]" : "md:pl-60")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-8">
          <IconButton label="Open menu" className="md:hidden" onClick={() => dispatch(setMobileNav(true))}>
            <Menu className="size-5" />
          </IconButton>
          <button
            onClick={() => dispatch(setSearchOpen(true))}
            className="flex h-10 w-full max-w-md items-center gap-2 rounded-lg border border-line bg-panel px-3 text-sm text-ink-3 hover:border-line-strong"
          >
            <Search className="size-4" aria-hidden />
            <span className="flex-1 text-left">Search products, people, expenses</span>
            <kbd className="hidden rounded border border-line px-1.5 font-sans text-xs sm:inline">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => dispatch(openDialog({ kind: "sale" }))}
              className="hidden h-10 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink hover:bg-accent-hover sm:inline-flex"
            >
              <Plus className="size-4" aria-hidden />
              Record sale
            </button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}
