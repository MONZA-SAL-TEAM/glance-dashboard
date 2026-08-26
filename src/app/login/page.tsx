"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Wrong password");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <form
        onSubmit={onSubmit}
        className="panel w-full max-w-md animate-rise rounded-2xl p-6 sm:rounded-3xl sm:p-8"
      >
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-teal-deep">
          Glance
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Enter to view analytics
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          This dashboard is private. Enter the password you were given to continue.
        </p>
        <label className="mt-6 block text-sm font-medium text-ink">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3.5 text-base text-ink outline-none ring-teal/30 focus:ring-4"
            autoFocus
            required
            autoComplete="current-password"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-coral">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="mt-6 min-h-12 w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-deep disabled:opacity-60"
        >
          {loading ? "Opening…" : "Open dashboard"}
        </button>
      </form>
    </main>
  );
}
