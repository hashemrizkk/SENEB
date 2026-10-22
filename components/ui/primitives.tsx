import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { AlertIcon, CheckIcon, CircleIcon, ClockIcon, InfoIcon, SparkleIcon } from "./icons";
import { uiCopy } from "@/components/copy/ui-copy";
import styles from "./ui.module.css";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export function Button({ variant = "primary", loading = false, children, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return <button {...props} className={`${styles.button} ${styles[`button_${variant}`]} ${className}`} aria-busy={loading || undefined} disabled={props.disabled || loading}>{loading ? <><span className={styles.spinner} aria-hidden="true" />{children}<span className={styles.visuallyHidden}>{uiCopy.loading.en}</span></> : children}</button>;
}

export function IconButton({ "aria-label": label, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { "aria-label": string }) {
  return <Button variant="quiet" className={styles.iconButton} aria-label={label} {...props} />;
}

export function Card({ as: Component = "section", className = "", children, ...props }: React.HTMLAttributes<HTMLElement> & { as?: "section" | "article" }) {
  return <Component className={`${styles.card} ${className}`} {...props}>{children}</Component>;
}

const statusIcons = { urgent: AlertIcon, important: ClockIcon, normal: CircleIcon, info: InfoIcon, success: CheckIcon } as const;
export type StatusVariant = keyof typeof statusIcons;
export function Badge({ variant, children, className = "" }: { variant: StatusVariant; children: ReactNode; className?: string }) {
  const StatusIcon = statusIcons[variant];
  return <span className={`${styles.badge} ${styles[`badge_${variant}`]} ${className}`}><StatusIcon className={styles.badgeIcon} />{children}</span>;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.control} ${props.className ?? ""}`} />;
}
export function Textarea({ counter, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { counter?: ReactNode }) {
  return <span className={styles.fieldStack}><textarea {...props} className={`${styles.control} ${styles.textarea} ${props.className ?? ""}`} />{counter ? <span className={styles.counter}>{counter}</span> : null}</span>;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${styles.control} ${styles.select} ${props.className ?? ""}`} />;
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const boundedValue = Math.min(Math.max(value, 0), max);
  return <div className={styles.progressGroup}><p className={styles.progressLabel}>{label}</p><progress className={styles.progress} value={boundedValue} max={max} aria-label={label}>{Math.round((boundedValue / max) * 100)}%</progress></div>;
}

export function Stepper({ steps, current, label }: { steps: string[]; current: number; label: (current: number, total: number) => string }) {
  return <div className={styles.stepper}><p className={styles.stepCount}>{label(current, steps.length)}</p><ol className={styles.stepList}>{steps.map((step, index) => {
    const number = index + 1;
    const done = number < current;
    return <li key={`${number}-${step}`} className={`${styles.step} ${number === current ? styles.stepCurrent : ""} ${done ? styles.stepDone : ""}`} aria-current={number === current ? "step" : undefined}><span className={styles.stepMarker}>{done ? <CheckIcon /> : number}</span><span>{step}</span></li>;
  })}</ol></div>;
}

export function InlineAlert({ children, title, role = "alert" }: { children: ReactNode; title?: string; role?: "alert" | "status" }) {
  return <div className={styles.inlineAlert} role={role}><AlertIcon className={styles.inlineAlertIcon} /><div>{title ? <strong>{title}</strong> : null}<div>{children}</div></div></div>;
}

export function Skeleton({ className = "", inlineSize = "100%", locale = "en" }: { className?: string; inlineSize?: string; locale?: "ar" | "en" }) {
  return <span className={`${styles.skeleton} ${className}`} style={{ inlineSize }} aria-busy="true"><span className={styles.visuallyHidden}>{uiCopy.loading[locale]}</span></span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className={styles.emptyState}><SparkleIcon className={styles.emptyIcon} /><p>{children}</p></div>;
}
export function SectionHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return <header className={styles.sectionHeader}><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{action}</header>;
}
export function UserText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <bdi dir="auto" className={`${styles.userText} ${className}`}>{children}</bdi>;
}
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className={styles.visuallyHidden}>{children}</span>;
}
