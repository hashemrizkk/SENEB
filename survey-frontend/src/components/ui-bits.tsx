import type { ReactNode } from "react";
import { useLang } from "../lib/lang";

/* ---------- Step progress ---------- */

export function StepProgress({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[13px] font-bold tracking-wide px-2.5 py-1 rounded-md"
          style={{ background: "hsl(var(--accent))", color: "hsl(var(--accent-foreground))", fontFamily: "'Hanken Grotesk', 'Cairo', sans-serif" }}
        >
          {label}
        </span>
      </div>
      <div className="flex gap-1.5" role="progressbar" aria-valuenow={current} aria-valuemin={1} aria-valuemax={total}>
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className="h-1.5 rounded-full flex-1 transition-colors duration-200"
            style={{ background: i < current ? "hsl(var(--primary))" : "hsl(var(--border))" }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------- Option card (single-select) ---------- */

export function OptionCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="opt-card" data-selected={selected} onClick={onClick} aria-pressed={selected}>
      <span
        aria-hidden="true"
        className="shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
        style={{ borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--input))" }}
      >
        {selected && <span className="w-2.5 h-2.5 rounded-full" style={{ background: "hsl(var(--primary))" }} />}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

/* ---------- Multi-select chip ---------- */

export function CheckCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="opt-card" data-selected={selected} onClick={onClick} aria-pressed={selected}>
      <span
        aria-hidden="true"
        className="shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors"
        style={{
          borderColor: selected ? "hsl(var(--primary))" : "hsl(var(--input))",
          background: selected ? "hsl(var(--primary))" : "transparent",
        }}
      >
        {selected && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FAF9F6" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
        )}
      </span>
      <span className="flex-1">{children}</span>
    </button>
  );
}

/* ---------- Field wrapper ---------- */

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string | null;
  hint?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={htmlFor} className="block font-semibold text-[16.5px] mb-1.5">
        {label}
      </label>
      {hint && (
        <p className="text-[14.5px] mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p role="alert" className="text-[14.5px] font-semibold mt-1.5" style={{ color: "hsl(var(--destructive))" }}>
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------- Nav buttons (back / next) — arrows flip with direction ---------- */

export function NavButtons({
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
  showBack = true,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}) {
  const { t, dir } = useLang();
  return (
    <div className="flex gap-3 mt-8">
      {showBack && onBack && (
        <button type="button" onClick={onBack} className="btn-ghost flex-none">
          <DirArrow dir={dir} point="back" />
          {t.back}
        </button>
      )}
      <button type="button" onClick={onNext} disabled={nextDisabled} className="btn-primary flex-1">
        {nextLabel ?? t.next}
        <DirArrow dir={dir} point="forward" />
      </button>
    </div>
  );
}

export function DirArrow({ dir, point }: { dir: "rtl" | "ltr"; point: "forward" | "back" }) {
  // In RTL "forward" points left; in LTR it points right.
  const angle = dir === "rtl" ? (point === "forward" ? 180 : 0) : point === "forward" ? 0 : 180;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: `rotate(${angle}deg)` }}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/* ---------- Error summary ---------- */

export function StepError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      aria-live="polite"
      className="text-[15px] font-semibold mt-4 px-4 py-3 rounded-xl"
      style={{ background: "hsl(var(--danger-tint))", color: "hsl(var(--danger))" }}
    >
      {message}
    </p>
  );
}
