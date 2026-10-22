import { useState } from "react";
import { useLang } from "../lib/lang";
import { isValidEgyptianPhone, normalizeEgyptianPhone } from "../lib/phone";
import { GOVERNORATES } from "../lib/governorates";
import { makeReferenceCode } from "../lib/strings";
import type { IntakeAnswers, Medication, SymptomId } from "../lib/types";
import { StepProgress, OptionCard, CheckCard, NavButtons, Field, StepError } from "../components/ui-bits";

const TOTAL_STEPS = 9;

const ALL_SYMPTOMS: (SymptomId | "chest_pain" | "shortness_of_breath" | "fainting")[] = [
  "frequent_urination",
  "excessive_thirst",
  "unusual_fatigue",
  "blurred_vision",
  "slow_wounds",
  "tingling_feet",
  "weight_loss",
  "chest_pain",
  "shortness_of_breath",
  "fainting",
];

const STEP_TITLES = ["f1Title", "f2Title", "f3Title", "f4Title", "f5Title", "f6Title", "f7Title", "f8Title", "f9Title"] as const;

function newMed(name = ""): Medication {
  return { id: crypto.randomUUID(), name, dose: "", regular: null };
}

export function IntakeForm({
  initial,
  onComplete,
  onExit,
}: {
  initial: IntakeAnswers;
  onComplete: (code: string) => void;
  onExit: () => void;
}) {
  const { t, lang } = useLang();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<IntakeAnswers>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const set = (patch: Partial<IntakeAnswers>) => {
    setData((d) => ({ ...d, ...patch }));
    setErrors({});
    setSubmitError(null);
  };

  /* ---------- per-step validation ---------- */
  const validateStep = (): boolean => {
    const e: Record<string, string> = {};
    if (step === 0) {
      const name = data.fullName.trim();
      if (!name || name.length < 2 || name.length > 100 || !/^[\p{L}\s'-]+$/u.test(name)) e.fullName = t.errName;
      const age = Number(data.age);
      if (!data.age || !Number.isInteger(age) || age < 1 || age > 120) e.age = t.errAge;
      if (!data.sex) e.sex = t.errRequired;
      if (!data.governorate) e.governorate = t.errRequired;
      if (!isValidEgyptianPhone(data.phone)) e.phone = t.errPhone;
      if (!data.channel) e.channel = t.errRequired;
    } else if (step === 1) {
      if (!data.diabetesStatus) e.diabetesStatus = t.errRequired;
      if (data.diagnosisYear) {
        const y = Number(data.diagnosisYear);
        if (!Number.isInteger(y) || y < 1950 || y > new Date().getFullYear()) e.diagnosisYear = t.errAge;
      }
    } else if (step === 2) {
      if (!data.labTestType) e.labTestType = t.errRequired;
      if (data.labTestType && data.labTestType !== "none" && !data.labValue.trim()) e.labValue = t.errRequired;
    } else if (step === 3) {
      if (data.takesMeds === null) e.takesMeds = t.errRequired;
      if (data.takesMeds) {
        if (data.medications.length === 0) e.medications = t.errRequired;
        data.medications.forEach((m) => {
          if (!m.name.trim()) e[`med_name_${m.id}`] = t.errRequired;
          if (m.regular === null) e[`med_regular_${m.id}`] = t.errRequired;
        });
      }
    } else if (step === 5) {
      if (!data.eyeExam) e.eyeExam = t.errRequired;
      if (data.footProblem === null) e.footProblem = t.errRequired;
      if (!data.kidneyTest) e.kidneyTest = t.errRequired;
      if (!data.hospitalVisits) e.hospitalVisits = t.errRequired;
    } else if (step === 6) {
      if (!data.smoking) e.smoking = t.errRequired;
      if (data.activity30 === null) e.activity30 = t.errRequired;
      if (!data.diet) e.diet = t.errRequired;
      if (!data.ramadan) e.ramadan = t.errRequired;
    } else if (step === 7) {
      if (!data.unitNearby) e.unitNearby = t.errRequired;
      if (!data.barrier) e.barrier = t.errRequired;
    } else if (step === 8) {
      if (!data.consent) e.consent = t.errConsent;
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleNext = () => {
    if (!validateStep()) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  };

  const handleBack = () => {
    setErrors({});
    if (step === 0) onExit();
    else setStep((s) => s - 1);
  };

  const handleSubmit = () => {
    if (!validateStep()) return;
    setSubmitting(true);
    // Demo build: the real deployment posts to the clinic's save endpoint.
    // Here we simulate the round-trip and issue a reference code.
    window.setTimeout(() => {
      setSubmitting(false);
      onComplete(makeReferenceCode());
    }, 900);
  };

  /* ---------- small helpers ---------- */
  const yesNoCards = (value: boolean | null, onPick: (v: boolean) => void) => (
    <div className="grid grid-cols-2 gap-3">
      <OptionCard selected={value === true} onClick={() => onPick(true)}>
        {t.yes}
      </OptionCard>
      <OptionCard selected={value === false} onClick={() => onPick(false)}>
        {t.no}
      </OptionCard>
    </div>
  );

  const reviewRow = (label: string, value: string | null) => (
    <div className="flex justify-between gap-4 py-2 text-[15.5px]" style={{ borderTop: "1px solid hsl(var(--border))" }}>
      <span style={{ color: "hsl(var(--muted-foreground))" }}>{label}</span>
      <span className="font-semibold text-end">{value ?? t.reviewEmpty}</span>
    </div>
  );

  const govLabel = (v: string) => {
    const g = GOVERNORATES.find((x) => x.value === v);
    return g ? (lang === "ar" ? g.ar : g.en) : v;
  };

  const label = {
    sex: data.sex === "male" ? t.male : data.sex === "female" ? t.female : null,
    channel:
      data.channel === "whatsapp" ? t.channel_whatsapp : data.channel === "sms" ? t.channel_sms : data.channel === "call" ? t.channel_call : null,
    status:
      data.diabetesStatus === "never_tested"
        ? t.status_never_tested
        : data.diabetesStatus === "prediabetic"
          ? t.status_prediabetic
          : data.diabetesStatus === "type2"
            ? t.status_type2
            : data.diabetesStatus === "type1"
              ? t.status_type1
              : null,
  };

  return (
    <main className="container-app pt-8 pb-16">
      <h1 className="font-extrabold text-[24px] mb-1.5">{t.formTitle}</h1>
      <p className="text-[15.5px] mb-6" style={{ color: "hsl(var(--muted-foreground))" }}>
        {t.formIntro}
      </p>

      <StepProgress current={step + 1} total={TOTAL_STEPS} label={t.stepXofY(step + 1, TOTAL_STEPS)} />
      <h2 className="font-bold text-[21px] mb-5">{t[STEP_TITLES[step]]}</h2>

      {/* ---------- Step 1: identity & contact ---------- */}
      {step === 0 && (
        <section>
          <Field label={t.fName} htmlFor="fullName" error={errors.fullName}>
            <input
              id="fullName"
              className="field-input"
              autoComplete="name"
              placeholder={t.fNamePlaceholder}
              value={data.fullName}
              onChange={(e) => set({ fullName: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.fAge} htmlFor="age" error={errors.age}>
              <input
                id="age"
                className="field-input"
                dir="ltr"
                inputMode="numeric"
                placeholder={t.fAgePlaceholder}
                value={data.age}
                onChange={(e) => set({ age: e.target.value })}
              />
            </Field>
            <Field label={t.fSex} error={errors.sex}>
              <div className="grid grid-cols-2 gap-2">
                <OptionCard selected={data.sex === "male"} onClick={() => set({ sex: "male" })}>
                  {t.male}
                </OptionCard>
                <OptionCard selected={data.sex === "female"} onClick={() => set({ sex: "female" })}>
                  {t.female}
                </OptionCard>
              </div>
            </Field>
          </div>
          <Field label={t.fGovernorate} error={errors.governorate}>
            <div
              className="rounded-xl overflow-y-auto space-y-2 p-2"
              style={{ maxHeight: 240, border: "1px solid hsl(var(--input))", background: "hsl(var(--card))" }}
              role="listbox"
              aria-label={t.fGovernorate}
            >
              {GOVERNORATES.map((g) => (
                <OptionCard key={g.value} selected={data.governorate === g.value} onClick={() => set({ governorate: g.value })}>
                  {lang === "ar" ? g.ar : g.en}
                </OptionCard>
              ))}
            </div>
          </Field>
          <Field label={t.fPhone} htmlFor="phone" error={errors.phone}>
            <input
              id="phone"
              className="field-input"
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              placeholder={t.fPhonePlaceholder}
              value={data.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </Field>
          <Field label={t.fChannel} error={errors.channel}>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={data.channel === "whatsapp"} onClick={() => set({ channel: "whatsapp" })}>
                {t.channel_whatsapp}
              </OptionCard>
              <OptionCard selected={data.channel === "sms"} onClick={() => set({ channel: "sms" })}>
                {t.channel_sms}
              </OptionCard>
              <OptionCard selected={data.channel === "call"} onClick={() => set({ channel: "call" })}>
                {t.channel_call}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fBestTime}>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={data.bestTime === "morning"} onClick={() => set({ bestTime: "morning" })}>
                {t.time_morning}
              </OptionCard>
              <OptionCard selected={data.bestTime === "afternoon"} onClick={() => set({ bestTime: "afternoon" })}>
                {t.time_afternoon}
              </OptionCard>
              <OptionCard selected={data.bestTime === "evening"} onClick={() => set({ bestTime: "evening" })}>
                {t.time_evening}
              </OptionCard>
            </div>
          </Field>
        </section>
      )}

      {/* ---------- Step 2: diabetes status ---------- */}
      {step === 1 && (
        <section>
          <Field label={t.fStatus} error={errors.diabetesStatus}>
            <div className="space-y-3">
              <OptionCard selected={data.diabetesStatus === "never_tested"} onClick={() => set({ diabetesStatus: "never_tested" })}>
                {t.status_never_tested}
              </OptionCard>
              <OptionCard selected={data.diabetesStatus === "prediabetic"} onClick={() => set({ diabetesStatus: "prediabetic" })}>
                {t.status_prediabetic}
              </OptionCard>
              <OptionCard selected={data.diabetesStatus === "type2"} onClick={() => set({ diabetesStatus: "type2" })}>
                {t.status_type2}
              </OptionCard>
              <OptionCard selected={data.diabetesStatus === "type1"} onClick={() => set({ diabetesStatus: "type1" })}>
                {t.status_type1}
              </OptionCard>
            </div>
          </Field>
          {(data.diabetesStatus === "type1" || data.diabetesStatus === "type2") && (
            <Field label={t.fDiagnosisYear} htmlFor="dxYear" error={errors.diagnosisYear}>
              <input
                id="dxYear"
                className="field-input"
                dir="ltr"
                inputMode="numeric"
                placeholder={t.fDiagnosisYearPlaceholder}
                value={data.diagnosisYear}
                onChange={(e) => set({ diagnosisYear: e.target.value })}
              />
            </Field>
          )}
        </section>
      )}

      {/* ---------- Step 3: latest numbers ---------- */}
      {step === 2 && (
        <section>
          <Field label={t.fLabType} error={errors.labTestType}>
            <div className="space-y-3">
              <OptionCard selected={data.labTestType === "none"} onClick={() => set({ labTestType: "none", labValue: "", labDate: "" })}>
                {t.lab_none}
              </OptionCard>
              <OptionCard selected={data.labTestType === "hba1c"} onClick={() => set({ labTestType: "hba1c" })}>
                {t.lab_hba1c}
              </OptionCard>
              <OptionCard selected={data.labTestType === "fasting_glucose"} onClick={() => set({ labTestType: "fasting_glucose" })}>
                {t.lab_fasting}
              </OptionCard>
            </div>
          </Field>
          {data.labTestType && data.labTestType !== "none" && (
            <>
              <Field
                label={t.fLabValue}
                htmlFor="labValue"
                error={errors.labValue}
              >
                <input
                  id="labValue"
                  className="field-input"
                  dir="ltr"
                  inputMode="decimal"
                  placeholder={data.labTestType === "hba1c" ? t.fLabValuePlaceholderHba1c : t.fLabValuePlaceholderFasting}
                  value={data.labValue}
                  onChange={(e) => set({ labValue: e.target.value })}
                />
              </Field>
              <Field label={t.fLabDate} htmlFor="labDate">
                <input
                  id="labDate"
                  className="field-input"
                  placeholder={t.fLabDatePlaceholder}
                  value={data.labDate}
                  onChange={(e) => set({ labDate: e.target.value })}
                />
              </Field>
            </>
          )}
          <Field label={t.fHomeReadings}>
            {yesNoCards(data.hasHomeReadings, (v) => set({ hasHomeReadings: v }))}
          </Field>
          {data.hasHomeReadings && (
            <Field label={t.fHomeValue} htmlFor="homeVal">
              <input
                id="homeVal"
                className="field-input"
                dir="ltr"
                inputMode="numeric"
                placeholder={t.fHomeValuePlaceholder}
                value={data.homeReadingValue}
                onChange={(e) => set({ homeReadingValue: e.target.value })}
              />
            </Field>
          )}
        </section>
      )}

      {/* ---------- Step 4: medications ---------- */}
      {step === 3 && (
        <section>
          <Field label={t.fTakesMeds} error={errors.takesMeds}>
            {yesNoCards(data.takesMeds, (v) => set({ takesMeds: v, medications: v ? (data.medications.length ? data.medications : [newMed()]) : [] }))}
          </Field>

          {data.takesMeds && (
            <>
              <p className="text-[14.5px] font-semibold mb-2" style={{ color: "hsl(var(--muted-foreground))" }}>
                {t.fMedQuickAdd}
              </p>
              <div className="flex flex-wrap gap-2 mb-5">
                {[t.medMetformin, t.medInsulin, t.medBp].map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="min-h-[44px] px-4 rounded-full border text-[15px] font-semibold transition-colors hover:bg-[hsl(var(--secondary))]"
                    style={{ borderColor: "hsl(var(--border))" }}
                    onClick={() => set({ medications: [...data.medications, newMed(name)] })}
                  >
                    + {name}
                  </button>
                ))}
              </div>
              {errors.medications && (
                <p role="alert" className="text-[14.5px] font-semibold mb-3" style={{ color: "hsl(var(--destructive))" }}>
                  {errors.medications}
                </p>
              )}
              {data.medications.map((m, i) => (
                <div key={m.id} className="rounded-2xl p-4 mb-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-[15.5px]" style={{ color: "hsl(var(--primary))" }}>
                      {i + 1}
                    </span>
                    <button
                      type="button"
                      className="min-h-[40px] px-3 text-[14.5px] font-semibold underline underline-offset-4"
                      style={{ color: "hsl(var(--muted-foreground))" }}
                      onClick={() => set({ medications: data.medications.filter((x) => x.id !== m.id) })}
                    >
                      {t.fMedRemove}
                    </button>
                  </div>
                  <Field label={t.fMedName} error={errors[`med_name_${m.id}`]}>
                    <input
                      className="field-input"
                      placeholder={t.fMedNamePlaceholder}
                      value={m.name}
                      onChange={(e) =>
                        set({ medications: data.medications.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)) })
                      }
                    />
                  </Field>
                  <Field label={t.fMedDose}>
                    <input
                      className="field-input"
                      placeholder={t.fMedDosePlaceholder}
                      value={m.dose}
                      onChange={(e) =>
                        set({ medications: data.medications.map((x) => (x.id === m.id ? { ...x, dose: e.target.value } : x)) })
                      }
                    />
                  </Field>
                  <Field label={t.fMedRegular} error={errors[`med_regular_${m.id}`]}>
                    {yesNoCards(m.regular, (v) =>
                      set({ medications: data.medications.map((x) => (x.id === m.id ? { ...x, regular: v } : x)) }),
                    )}
                  </Field>
                </div>
              ))}
              <button
                type="button"
                className="btn-ghost w-full"
                onClick={() => set({ medications: [...data.medications, newMed()] })}
              >
                + {t.fMedAdd}
              </button>
            </>
          )}
        </section>
      )}

      {/* ---------- Step 5: symptoms ---------- */}
      {step === 4 && (
        <section>
          <p className="text-[15px] mb-4" style={{ color: "hsl(var(--muted-foreground))" }}>
            {t.f5Hint}
          </p>
          <div className="space-y-3">
            {ALL_SYMPTOMS.map((s) => (
              <CheckCard
                key={s}
                selected={data.symptoms.includes(s)}
                onClick={() =>
                  set({ symptoms: data.symptoms.includes(s) ? data.symptoms.filter((x) => x !== s) : [...data.symptoms, s] })
                }
              >
                {t[`symptom_${s}`]}
              </CheckCard>
            ))}
            <CheckCard selected={data.symptoms.length === 0} onClick={() => set({ symptoms: [] })}>
              {t.symptomsNone}
            </CheckCard>
          </div>
        </section>
      )}

      {/* ---------- Step 6: complication screening ---------- */}
      {step === 5 && (
        <section>
          <Field label={t.fEyeExam} error={errors.eyeExam}>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard selected={data.eyeExam === "within_year"} onClick={() => set({ eyeExam: "within_year" })}>
                {t.exam_within_year}
              </OptionCard>
              <OptionCard selected={data.eyeExam === "over_year"} onClick={() => set({ eyeExam: "over_year" })}>
                {t.exam_over_year}
              </OptionCard>
              <OptionCard selected={data.eyeExam === "never"} onClick={() => set({ eyeExam: "never" })}>
                {t.exam_never}
              </OptionCard>
              <OptionCard selected={data.eyeExam === "unknown"} onClick={() => set({ eyeExam: "unknown" })}>
                {t.exam_unknown}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fFootProblem} error={errors.footProblem}>
            {yesNoCards(data.footProblem, (v) => set({ footProblem: v }))}
          </Field>
          <Field label={t.fKidney} error={errors.kidneyTest}>
            <div className="grid grid-cols-2 gap-2">
              <OptionCard selected={data.kidneyTest === "within_year"} onClick={() => set({ kidneyTest: "within_year" })}>
                {t.exam_within_year}
              </OptionCard>
              <OptionCard selected={data.kidneyTest === "never"} onClick={() => set({ kidneyTest: "never" })}>
                {t.exam_never}
              </OptionCard>
              <OptionCard selected={data.kidneyTest === "unknown"} onClick={() => set({ kidneyTest: "unknown" })}>
                {t.exam_unknown}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fHospital} error={errors.hospitalVisits}>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={data.hospitalVisits === "0"} onClick={() => set({ hospitalVisits: "0" })}>
                {t.visits0}
              </OptionCard>
              <OptionCard selected={data.hospitalVisits === "1"} onClick={() => set({ hospitalVisits: "1" })}>
                {t.visits1}
              </OptionCard>
              <OptionCard selected={data.hospitalVisits === "2plus"} onClick={() => set({ hospitalVisits: "2plus" })}>
                {t.visits2plus}
              </OptionCard>
            </div>
          </Field>
        </section>
      )}

      {/* ---------- Step 7: lifestyle ---------- */}
      {step === 6 && (
        <section>
          <Field label={t.fSmoking} error={errors.smoking}>
            <div className="space-y-3">
              <OptionCard selected={data.smoking === "never"} onClick={() => set({ smoking: "never" })}>
                {t.smoking_never}
              </OptionCard>
              <OptionCard selected={data.smoking === "former"} onClick={() => set({ smoking: "former" })}>
                {t.smoking_former}
              </OptionCard>
              <OptionCard selected={data.smoking === "current"} onClick={() => set({ smoking: "current" })}>
                {t.smoking_current}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fActivity} error={errors.activity30}>
            {yesNoCards(data.activity30, (v) => set({ activity30: v }))}
          </Field>
          <Field label={t.fDiet} error={errors.diet}>
            <div className="space-y-3">
              <OptionCard selected={data.diet === "good"} onClick={() => set({ diet: "good" })}>
                {t.diet_good}
              </OptionCard>
              <OptionCard selected={data.diet === "average"} onClick={() => set({ diet: "average" })}>
                {t.diet_average}
              </OptionCard>
              <OptionCard selected={data.diet === "poor"} onClick={() => set({ diet: "poor" })}>
                {t.diet_poor}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fRamadan} hint={t.fRamadanHint} error={errors.ramadan}>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={data.ramadan === "yes"} onClick={() => set({ ramadan: "yes" })}>
                {t.ramadan_yes}
              </OptionCard>
              <OptionCard selected={data.ramadan === "no"} onClick={() => set({ ramadan: "no" })}>
                {t.ramadan_no}
              </OptionCard>
              <OptionCard selected={data.ramadan === "not_sure"} onClick={() => set({ ramadan: "not_sure" })}>
                {t.ramadan_not_sure}
              </OptionCard>
            </div>
          </Field>
        </section>
      )}

      {/* ---------- Step 8: care access ---------- */}
      {step === 7 && (
        <section>
          <Field label={t.fUnitNearby} error={errors.unitNearby}>
            <div className="grid grid-cols-3 gap-2">
              <OptionCard selected={data.unitNearby === "yes"} onClick={() => set({ unitNearby: "yes" })}>
                {t.yes}
              </OptionCard>
              <OptionCard selected={data.unitNearby === "no"} onClick={() => set({ unitNearby: "no" })}>
                {t.no}
              </OptionCard>
              <OptionCard selected={data.unitNearby === "unknown"} onClick={() => set({ unitNearby: "unknown" })}>
                {t.unknown}
              </OptionCard>
            </div>
          </Field>
          <Field label={t.fBarrier} error={errors.barrier}>
            <div className="space-y-3">
              <OptionCard selected={data.barrier === "none"} onClick={() => set({ barrier: "none" })}>
                {t.barrier_none}
              </OptionCard>
              <OptionCard selected={data.barrier === "cost"} onClick={() => set({ barrier: "cost" })}>
                {t.barrier_cost}
              </OptionCard>
              <OptionCard selected={data.barrier === "distance"} onClick={() => set({ barrier: "distance" })}>
                {t.barrier_distance}
              </OptionCard>
              <OptionCard selected={data.barrier === "time"} onClick={() => set({ barrier: "time" })}>
                {t.barrier_time}
              </OptionCard>
              <OptionCard selected={data.barrier === "fear"} onClick={() => set({ barrier: "fear" })}>
                {t.barrier_fear}
              </OptionCard>
            </div>
          </Field>
        </section>
      )}

      {/* ---------- Step 9: review & consent ---------- */}
      {step === 8 && (
        <section>
          <div className="rounded-2xl p-5 mb-6" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
            <h3 className="font-bold text-[16.5px] mb-2">{t.fReviewTitle}</h3>
            {reviewRow(t.fName, data.fullName.trim() || null)}
            {reviewRow(t.fAge, data.age || null)}
            {reviewRow(t.fSex, label.sex)}
            {reviewRow(t.fGovernorate, data.governorate ? govLabel(data.governorate) : null)}
            {reviewRow(t.fPhone, normalizeEgyptianPhone(data.phone) ?? data.phone ?? null)}
            {reviewRow(t.fChannel, label.channel)}
            {reviewRow(t.fStatus, label.status)}
          </div>

          <Field label={t.fAnythingElse} htmlFor="anythingElse">
            <textarea
              id="anythingElse"
              className="field-input"
              rows={4}
              maxLength={300}
              placeholder={t.fAnythingElsePlaceholder}
              value={data.anythingElse}
              onChange={(e) => set({ anythingElse: e.target.value })}
            />
            <p className="text-[13.5px] mt-1 text-end" style={{ color: "hsl(var(--muted-foreground))" }}>
              {t.charCount(data.anythingElse.length, 300)}
            </p>
          </Field>

          <div className="mt-2">
            <CheckCard selected={data.consent} onClick={() => set({ consent: !data.consent })}>
              <span className="font-semibold">{t.fConsent}</span>
            </CheckCard>
            {errors.consent && (
              <p role="alert" className="text-[14.5px] font-semibold mt-2" style={{ color: "hsl(var(--destructive))" }}>
                {errors.consent}
              </p>
            )}
          </div>

          <StepError message={submitError} />
          <div className="flex gap-3 mt-8">
            <button type="button" onClick={handleBack} className="btn-ghost flex-none">
              {t.back}
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting} className="btn-primary flex-1">
              {submitting ? t.submitting : t.submit}
            </button>
          </div>
        </section>
      )}

      {step < 8 && (
        <>
          <StepError message={Object.values(errors)[0] ?? null} />
          <NavButtons onBack={handleBack} onNext={handleNext} />
        </>
      )}
    </main>
  );
}
