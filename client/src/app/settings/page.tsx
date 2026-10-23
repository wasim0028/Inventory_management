"use client";

import { signOut } from "aws-amplify/auth";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { useGetMeQuery } from "@/state/api";
import { setTheme, useAppDispatch, useAppSelector, type Theme } from "@/state/store";
import { authEnabled, config } from "@/lib/config";
import { Button, cx, PageHeader, Panel, Skeleton } from "@/components/ui";

const THEMES: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match device", icon: Monitor },
];

export default function SettingsPage() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.ui.theme);
  const { data: me, isLoading } = useGetMeQuery();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid max-w-3xl gap-6">
        <Panel title="Your account">
          {isLoading ? (
            <Skeleton className="h-16" />
          ) : (
            <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
              <dt className="text-ink-2">Email</dt>
              <dd className="font-medium">{me?.email ?? "Not signed in"}</dd>
              <dt className="text-ink-2">Permissions</dt>
              <dd>
                {me?.groups.includes("admin")
                  ? "Admin: can archive products, delete expenses and manage the team"
                  : "Staff: can add products, record sales, receive stock and add expenses"}
              </dd>
            </dl>
          )}
          {authEnabled ? (
            <Button className="mt-5" onClick={() => signOut()}>
              <LogOut className="size-4" aria-hidden /> Sign out
            </Button>
          ) : (
            <p className="mt-5 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              Local mode: sign-in is off because no Cognito user pool is configured.
            </p>
          )}
        </Panel>

        <Panel title="Appearance">
          <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                onClick={() => dispatch(setTheme(value))}
                className={cx(
                  "flex items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                  theme === value ? "border-accent bg-accent-soft text-accent" : "border-line hover:border-line-strong",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="Connection">
          <dl className="grid grid-cols-[140px_1fr] gap-y-3 text-sm">
            <dt className="text-ink-2">API</dt>
            <dd className="break-all">{config.apiBaseUrl}</dd>
            <dt className="text-ink-2">Region</dt>
            <dd>{config.region}</dd>
            <dt className="text-ink-2">Currency</dt>
            <dd>{config.currency}</dd>
          </dl>
        </Panel>
      </div>
    </>
  );
}
