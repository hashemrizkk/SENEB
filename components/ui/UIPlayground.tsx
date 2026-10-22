"use client";

import { useState } from "react";
import { ar } from "@/lib/strings.ar";
import { uiCopy } from "@/components/copy/ui-copy";
import { AlertIcon, CheckIcon } from "./icons";
import { Badge, Button, Card, EmptyState, IconButton, InlineAlert, Input, ProgressBar, SectionHeader, Select, Skeleton, Stepper, Textarea, UserText, VisuallyHidden } from "./primitives";
import { Modal, Toast } from "./interactive";
import styles from "./ui.module.css";

function Showcase({ dir, lang }: { dir: "rtl" | "ltr"; lang: "ar" | "en" }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const arabic = lang === "ar";
  const stepOf = arabic ? ar.register.stepOf : (step: number, total: number) => `Step ${step} of ${total}: ${step === 1 ? "Input" : "Review and save"}`;
  const steps = arabic ? [ar.register.step1Title, ar.register.step2Title, ar.register.step3Title, ar.register.step4Title] : ["Input", "Review and save"];
  const currentStep = 2;
  const stepLabel = stepOf(currentStep, steps.length);

  return <section className={styles.showcase} dir={dir} lang={lang}>
    <SectionHeader title={arabic ? ar.register.step1Title : "Doctor sign in"} description={arabic ? ar.register.stepOf(2, 4) : "Step 1 of 2: Input"} />
    <div className={styles.showcaseGrid}>
      <Card>
        <h3>{arabic ? ar.register.step4Title : "Review speakers"}</h3>
        <div className={styles.showcaseRow}><Badge variant="urgent">Urgent</Badge><Badge variant="important">Important</Badge><Badge variant="normal">Normal</Badge></div>
        <div className={styles.showcaseRow}><Badge variant="info">AI unavailable: transcript and verified code findings only</Badge><Badge variant="success">All completed segments transcribed.</Badge></div>
        <p>{arabic ? ar.demoWarning : "Demo only: no login. Do not use with real patients."}</p>
      </Card>
      <Card>
        <label className={styles.showcaseField}>{arabic ? ar.register.fullName : "Staff name"}<Input name={arabic ? "الاسم" : "staff-name"} /></label>
        <label className={styles.showcaseField}>{arabic ? ar.register.notes : "Note"}<Textarea rows={3} /></label>
        <label className={styles.showcaseField}>{arabic ? ar.register.step1Title : "Staff role"}<Select defaultValue="doctor"><option value="doctor">Doctor</option><option value="nurse">Nurse</option></Select></label>
        <div className={styles.showcaseRow}><Button>{arabic ? ar.register.next : "Sign in"}</Button><Button variant="secondary">{arabic ? ar.register.back : "Cancel"}</Button><Button variant="danger">Remove</Button><IconButton aria-label={uiCopy.dismissToast}><AlertIcon /></IconButton></div>
      </Card>
      <Card>
        <Stepper steps={steps} current={currentStep} label={stepOf} />
        <ProgressBar value={currentStep} max={steps.length} label={stepLabel} />
        <div className={styles.showcaseStack}><Skeleton locale={lang} inlineSize="84%" /><Skeleton locale={lang} inlineSize="62%" /><Skeleton locale={lang} inlineSize="72%" /></div>
      </Card>
      <Card>
        <InlineAlert>This light checks documentation completeness against patient data. It does not judge whether care was correct or whether the patient is safe.</InlineAlert>
        <EmptyState>No checklist results are stored for this older note.</EmptyState>
        <p><UserText>هذه الجلسة بتتسجل بموافقتك</UserText></p>
        <VisuallyHidden>{uiCopy.loading[lang]}</VisuallyHidden>
        <div className={styles.showcaseRow}><Button variant="secondary" onClick={() => setModalOpen(true)}>Review speakers</Button><Button variant="quiet" onClick={() => setToastOpen(true)}>Retry</Button><CheckIcon className={styles.sampleIcon} /></div>
      </Card>
    </div>
    <Modal open={modalOpen} title="Session summary" onClose={() => setModalOpen(false)}><p>Draft, not part of the record</p><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button></Modal>
    {toastOpen ? <Toast message="Recording stopped" onDismiss={() => setToastOpen(false)} /> : null}
  </section>;
}

export default function UIPlayground() {
  return <div className={styles.uiKit}><h1>{uiCopy.uiKitTitle}</h1><Showcase dir="rtl" lang="ar" /><Showcase dir="ltr" lang="en" /></div>;
}
