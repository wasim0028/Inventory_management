"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Provider } from "react-redux";
import { Toaster } from "sonner";
import { getCurrentUser } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { api } from "@/state/api";
import { hydrate, makeStore, useAppSelector, type AppStore, type Theme } from "@/state/store";
import { authEnabled } from "@/lib/config";
import { configureAuth } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { AuthScreen } from "@/components/AuthScreen";
import { CommandPalette } from "@/components/CommandPalette";
import { Dialogs } from "@/components/Dialogs";
import { ProductDrawer } from "@/components/ProductDrawer";

const PREFS_KEY = "stockroom:prefs";

function readPrefs(): { sidebarCollapsed?: boolean; theme?: Theme } {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

/** Applies the theme to <html> and remembers UI preferences per browser. */
function ThemeAndPrefs() {
  const theme = useAppSelector((s) => s.ui.theme);
  const collapsed = useAppSelector((s) => s.ui.sidebarCollapsed);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ theme, sidebarCollapsed: collapsed }));
    } catch {
      /* storage unavailable: preferences just won't persist */
    }
  }, [theme, collapsed]);

  return null;
}

type AuthState = "checking" | "signedIn" | "signedOut";

function AuthGate({ children, store }: { children: ReactNode; store: AppStore }) {
  const [state, setState] = useState<AuthState>(authEnabled ? "checking" : "signedIn");

  useEffect(() => {
    if (!authEnabled) return;
    configureAuth();
    getCurrentUser()
      .then(() => setState("signedIn"))
      .catch(() => setState("signedOut"));
    return Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedOut" || payload.event === "tokenRefresh_failure") {
        store.dispatch(api.util.resetApiState()); // drop the previous user's cached data
        setState("signedOut");
      }
    });
  }, [store]);

  if (state === "checking") {
    return <div className="min-h-dvh" aria-busy="true" />;
  }
  if (state === "signedOut") return <AuthScreen onSignedIn={() => setState("signedIn")} />;
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const storeRef = useRef<AppStore>(null);
  if (!storeRef.current) {
    storeRef.current = makeStore();
  }

  useEffect(() => {
    storeRef.current?.dispatch(hydrate(readPrefs()));
  }, []);

  return (
    <Provider store={storeRef.current}>
      <ThemeAndPrefs />
      <AuthGate store={storeRef.current}>
        <AppShell>{children}</AppShell>
        <CommandPalette />
        <Dialogs />
        <ProductDrawer />
      </AuthGate>
      <Toaster position="bottom-right" richColors closeButton />
    </Provider>
  );
}
