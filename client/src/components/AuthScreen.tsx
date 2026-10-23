"use client";

import { useState, type FormEvent } from "react";
import {
  confirmResetPassword,
  confirmSignIn,
  confirmSignUp,
  resetPassword,
  signIn,
  signUp,
} from "aws-amplify/auth";
import { Leaf } from "lucide-react";
import { APP_NAME } from "@/lib/config";
import { Button, Field, Input } from "./ui";

type Step = "signIn" | "signUp" | "confirmSignUp" | "forgot" | "confirmReset" | "newPassword";

const copy: Record<Step, { title: string; body: string }> = {
  signIn: { title: "Sign in", body: "Use your work email to open the stockroom." },
  signUp: { title: "Create an account", body: "You'll get a code by email to confirm it." },
  confirmSignUp: { title: "Check your email", body: "Enter the 6-digit code we sent you." },
  forgot: { title: "Reset your password", body: "We'll email you a code to set a new one." },
  confirmReset: { title: "Set a new password", body: "Enter the code from your email and a new password." },
  newPassword: { title: "Choose a password", body: "Your admin created this account. Set your own password to continue." },
};

function authError(err: unknown) {
  const e = err as { name?: string; message?: string };
  switch (e?.name) {
    case "NotAuthorizedException":
      return "Email or password is incorrect.";
    case "UserNotConfirmedException":
      return "Confirm your email first. We've sent you a new code.";
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in instead.";
    case "CodeMismatchException":
      return "That code doesn't match. Check the latest email and try again.";
    case "InvalidPasswordException":
      return "Use at least 10 characters with upper and lower case letters and a number.";
    case "NotAuthorizedExceptionSignUp":
    case "LimitExceededException":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return e?.message ?? "Something went wrong. Try again.";
  }
}

export function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [step, setStep] = useState<Step>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (step === "signIn") {
        const res = await signIn({ username: email, password });
        const next = res.nextStep.signInStep;
        if (res.isSignedIn) onSignedIn();
        else if (next === "CONFIRM_SIGN_UP") setStep("confirmSignUp");
        else if (next === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
          setPassword("");
          setStep("newPassword");
        } else setError(`Additional sign-in step required: ${next}`);
      } else if (step === "newPassword") {
        const res = await confirmSignIn({ challengeResponse: password });
        if (res.isSignedIn) onSignedIn();
      } else if (step === "signUp") {
        await signUp({
          username: email,
          password,
          options: { userAttributes: { email, ...(name ? { name } : {}) } },
        });
        setStep("confirmSignUp");
      } else if (step === "confirmSignUp") {
        await confirmSignUp({ username: email, confirmationCode: code });
        const res = await signIn({ username: email, password });
        if (res.isSignedIn) onSignedIn();
        else setStep("signIn");
      } else if (step === "forgot") {
        await resetPassword({ username: email });
        setStep("confirmReset");
      } else if (step === "confirmReset") {
        await confirmResetPassword({ username: email, confirmationCode: code, newPassword: password });
        setPassword("");
        setCode("");
        setStep("signIn");
      }
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  const submitLabel: Record<Step, string> = {
    signIn: "Sign in",
    signUp: "Create account",
    confirmSignUp: "Confirm email",
    forgot: "Email me a code",
    confirmReset: "Save new password",
    newPassword: "Save password",
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-accent lg:block" aria-hidden>
        {/* Shelf diagram: rows of stock bars, some below their reorder tick */}
        <div className="absolute inset-0 flex flex-col justify-center gap-5 px-16 opacity-90">
          {[0.82, 0.3, 0.64, 0.12, 0.9, 0.45, 0.7, 0.22, 0.58].map((v, i) => (
            <div key={i} className="relative h-3 rounded-full bg-white/15">
              <div className="absolute inset-y-0 left-0 rounded-full bg-white/70" style={{ width: `${v * 100}%` }} />
              <div className="absolute -top-1.5 -bottom-1.5 left-1/3 w-0.5 rounded bg-white" />
            </div>
          ))}
        </div>
        <p className="absolute bottom-10 left-16 max-w-[34ch] font-display text-2xl font-semibold leading-snug text-white">
          Know what&apos;s on the shelf, and what to reorder next.
        </p>
      </div>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 flex items-center gap-2 text-accent">
            <Leaf className="size-6" aria-hidden />
            <span className="font-display text-xl font-semibold text-ink">{APP_NAME}</span>
          </div>
          <h1 className="font-display text-3xl font-semibold">{copy[step].title}</h1>
          <p className="mt-1 text-ink-2">{copy[step].body}</p>

          <form onSubmit={handle} className="mt-8 flex flex-col gap-4">
            {step === "signUp" && (
              <Field label="Name">
                {(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
              </Field>
            )}
            {["signIn", "signUp", "forgot"].includes(step) && (
              <Field label="Email">
                {(id) => (
                  <Input
                    id={id}
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                )}
              </Field>
            )}
            {["confirmSignUp", "confirmReset"].includes(step) && (
              <Field label="Code">
                {(id) => (
                  <Input
                    id={id}
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                    autoFocus
                  />
                )}
              </Field>
            )}
            {["signIn", "signUp", "confirmReset", "newPassword"].includes(step) && (
              <Field
                label={step === "signIn" ? "Password" : "New password"}
                hint={step === "signIn" ? undefined : "At least 10 characters, with upper and lower case and a number"}
              >
                {(id) => (
                  <Input
                    id={id}
                    type="password"
                    required
                    minLength={step === "signIn" ? undefined : 10}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={step === "signIn" ? "current-password" : "new-password"}
                  />
                )}
              </Field>
            )}

            {error && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" loading={busy} className="mt-2 w-full">
              {submitLabel[step]}
            </Button>
          </form>

          <div className="mt-6 flex flex-col gap-2 text-sm text-ink-2">
            {step === "signIn" && (
              <>
                <button className="text-left hover:text-ink" onClick={() => setStep("forgot")}>
                  Forgot your password?
                </button>
                <button className="text-left hover:text-ink" onClick={() => setStep("signUp")}>
                  New here? Create an account
                </button>
              </>
            )}
            {step !== "signIn" && (
              <button className="text-left hover:text-ink" onClick={() => setStep("signIn")}>
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
