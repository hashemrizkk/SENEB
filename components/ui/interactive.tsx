"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { uiCopy } from "@/components/copy/ui-copy";
import { CloseIcon } from "./icons";
import styles from "./ui.module.css";

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const priorFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    priorFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') ?? []);
    focusable()[0]?.focus();
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus(); }
      else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); priorFocus.current?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}><header className={styles.modalHeader}><h2 id={titleId}>{title}</h2><button type="button" className={styles.iconButton} aria-label={uiCopy.closeDialog} onClick={onClose}><CloseIcon /></button></header><div>{children}</div></div></div>;
}

export function Toast({ message, onDismiss, critical = false }: { message: string; onDismiss: () => void; critical?: boolean }) {
  useEffect(() => {
    if (critical) return;
    const timer = window.setTimeout(onDismiss, 4000);
    return () => window.clearTimeout(timer);
  }, [critical, onDismiss]);
  return <div className={styles.toast} role={critical ? "alert" : "status"} aria-live={critical ? "assertive" : "polite"}><span>{message}</span><button type="button" className={styles.toastDismiss} aria-label={uiCopy.dismissToast} onClick={onDismiss}><CloseIcon /></button></div>;
}
