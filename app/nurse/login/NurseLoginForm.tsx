"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NurseLoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/nurse/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const result: unknown = await response.json();
      if (response.ok) {
        router.replace("/nurse");
        router.refresh();
      } else if (
        result !== null &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
      ) {
        setError(result.error);
      } else {
        setError("Sign in failed. Check your details and try again.");
      }
    } catch {
      setError("The request failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <label style={{ display: "grid", gap: 6, marginBlock: 16 }}>
        Nurse name
        <input
          autoComplete="username"
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(event) => setName(event.target.value)}
          style={{ boxSizing: "border-box", width: "100%", padding: 10 }}
        />
      </label>
      <label style={{ display: "grid", gap: 6, marginBlock: 16 }}>
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          maxLength={512}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={{ boxSizing: "border-box", width: "100%", padding: 10 }}
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
