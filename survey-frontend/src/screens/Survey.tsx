import { useMemo, useState } from "react";
import { useLang } from "../lib/lang";
import { computeBmi } from "../lib/findrisc";
import type { SurveyAnswers, SymptomId, SevereSymptomId } from "../lib/types";
import { StepProgress, OptionCard, CheckCard, NavButtons, StepError, Field } from "../components/ui-bits";

const TOTAL_STEPS = 10;

const SYMPTOMS: SymptomId[] = [
  "frequent_urination",
  "excessive_thirst",
  "unusual_fatigue",
  "blurred_vision",
  "slow_wounds",
  "tingling_feet",
  "weight_loss",
];

const SEVERE: SevereSymptomId[] = ["confusion", "persistent_vomiting", "fruity_breath", "severe_abdominal_pain"];

function toggleInList<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export function Survey({
  answers,
  setAnswers,
  onFinish,
  onEmergency,
  onExit,
}: {
  answers: SurveyAnswers;
  setAnswers: (a: SurveyAnswers) => void;
  onFinish: () => void;
  onEmergency: () => void;
  onExit: () => void;
}) {
  const { t } = useLang();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [waistCm, setWaistCm] = useState(answers.waist?.kind === "cm" ? String(answers.waist.value) : "");
  const [useShape, setUseShape] = useState(answers.waist?.kind === "shape");

  const set = (patch: Partial<SurveyAnswers>) => setAnswers({ ...answers, ...patch });

  const bmi = useMemo(() => computeBmi(answers.heightCm, answers.weightKg), [answers.heightCm, answers.weightKg]);

  const stepValid = (): boolean => {
    switch (step) {
      case 0:
        return answers.ageBand !== null;
      case 1:
        return bmi !== null;
      case 2:
        return (
          answers.sex !== null &&
          (useShape ? answers.waist?.kind === "shape" : waistCm.trim() !== "" && Number(waistCm) >= 50 && Number(waistCm) <= 250)
        );
      case 3:
        return answers.activity30 !== null;
      case 4:
        return answers.fruitVegDaily !== null;
      case 5:
        return answers.bpMedsEver !== null;
      case 6:
        return answers.highGlucoseEver !== null;
      case 7:
        return answers.familyHistory !== null;
      case 8:
        return true; // symptoms optional (none-of-these selectable)
      case 9:
        return true; // severe: empty means none
      default:
        return false;
    }
  };

  const stepError = (): string => {
    if (step === 1) return t.errHeightWeight;
    if (step === 2) return t.errWaist;
    return t.requiredHint;
  };

  const handleNext = () => {
    if (!stepValid()) {
      setError(stepError());
      return;
    }
    setError(null);

    // Persist waist answer on leaving its step
    if (step === 2) {
      if (useShape) {
        if (answers.waist?.kind !== "shape") return; // requires shape selection (stepValid covers)
      } else {
        setAnswers({ ...answers, waist: { kind: "cm", value: Number(waistCm) } });
      }
    }

    if (step === TOTAL_STEPS - 1) {
      if (answers.severeSymptoms.length > 0) onEmergency();
      else onFinish();
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    setError(null);
    if (step === 0) onExit();
    else setStep(step - 1);
  };

  const questionTitle = (text: string, hint?: string) => (
    <div className="mb-5">
      <h2 className="font-bold text-[22px] leading-snug">{text}</h2>
      {hint && (
        <p className="text-[15px] mt-1.5" style={{ color: "hsl(var(--muted-foreground))" }}>
          {hint}
        </p>
      )}
    </div>
  );

  return (
    <main className="container-app pt-8 pb-16">
      <StepProgress current={step + 1} total={TOTAL_STEPS} label={t.questionXofY(step + 1, TOTAL_STEPS)} />

      {step === 0 && (
        <section>
          {questionTitle(t.qAge)}
          <div className="space-y-3">
            <OptionCard selected={answers.ageBand === "lt45"} onClick={() => set({ ageBand: "lt45" })}>
              {t.ageLt45}
            </OptionCard>
            <OptionCard selected={answers.ageBand === "45_54"} onClick={() => set({ ageBand: "45_54" })}>
              {t.age4554}
            </OptionCard>
            <OptionCard selected={answers.ageBand === "55_64"} onClick={() => set({ ageBand: "55_64" })}>
              {t.age5564}
            </OptionCard>
            <OptionCard selected={answers.ageBand === "gte65"} onClick={() => set({ ageBand: "gte65" })}>
              {t.age65plus}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 1 && (
        <section>
          {questionTitle(t.qBmi, t.qBmiHint)}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.heightCm} htmlFor="height">
              <input
                id="height"
                className="field-input"
                dir="ltr"
                inputMode="numeric"
                placeholder={t.heightPlaceholder}
                value={answers.heightCm ?? ""}
                onChange={(e) => set({ heightCm: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
            <Field label={t.weightKg} htmlFor="weight">
              <input
                id="weight"
                className="field-input"
                dir="ltr"
                inputMode="decimal"
                placeholder={t.weightPlaceholder}
                value={answers.weightKg ?? ""}
                onChange={(e) => set({ weightKg: e.target.value === "" ? null : Number(e.target.value) })}
              />
            </Field>
          </div>
          {bmi !== null && (
            <p
              className="text-[15px] font-semibold px-4 py-2.5 rounded-xl inline-block"
              style={{ background: "hsl(var(--secondary))", color: "hsl(var(--secondary-foreground))" }}
              aria-live="polite"
            >
              {t.yourBmi(String(bmi))}
            </p>
          )}
        </section>
      )}

      {step === 2 && (
        <section>
          {questionTitle(t.qWaist, t.qWaistHint)}
          <Field label={t.sexLabel}>
            <div className="grid grid-cols-2 gap-3">
              <OptionCard selected={answers.sex === "male"} onClick={() => set({ sex: "male" })}>
                {t.male}
              </OptionCard>
              <OptionCard selected={answers.sex === "female"} onClick={() => set({ sex: "female" })}>
                {t.female}
              </OptionCard>
            </div>
          </Field>

          {!useShape ? (
            <Field label={t.waistCm} htmlFor="waist">
              <input
                id="waist"
                className="field-input"
                dir="ltr"
                inputMode="numeric"
                placeholder={t.waistPlaceholder}
                value={waistCm}
                onChange={(e) => setWaistCm(e.target.value)}
              />
            </Field>
          ) : (
            <div className="space-y-3 mb-5">
              <OptionCard
                selected={answers.waist?.kind === "shape" && answers.waist.value === "slim"}
                onClick={() => set({ waist: { kind: "shape", value: "slim" } })}
              >
                {t.shapeSlim}
              </OptionCard>
              <OptionCard
                selected={answers.waist?.kind === "shape" && answers.waist.value === "some_belly"}
                onClick={() => set({ waist: { kind: "shape", value: "some_belly" } })}
              >
                {t.shapeBelly}
              </OptionCard>
              <OptionCard
                selected={answers.waist?.kind === "shape" && answers.waist.value === "large"}
                onClick={() => set({ waist: { kind: "shape", value: "large" } })}
              >
                {t.shapeLarge}
              </OptionCard>
            </div>
          )}

          <button
            type="button"
            className="min-h-[44px] text-[15px] font-semibold underline underline-offset-4"
            style={{ color: "hsl(var(--primary))" }}
            onClick={() => {
              setUseShape(!useShape);
              if (!useShape) setAnswers({ ...answers, waist: null });
            }}
          >
            {useShape ? t.waistCm : t.waistDontKnow}
          </button>
        </section>
      )}

      {step === 3 && (
        <section>
          {questionTitle(t.qActivity, t.qActivityHint)}
          <div className="grid grid-cols-2 gap-3">
            <OptionCard selected={answers.activity30 === true} onClick={() => set({ activity30: true })}>
              {t.yes}
            </OptionCard>
            <OptionCard selected={answers.activity30 === false} onClick={() => set({ activity30: false })}>
              {t.no}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 4 && (
        <section>
          {questionTitle(t.qFood)}
          <div className="grid grid-cols-2 gap-3">
            <OptionCard selected={answers.fruitVegDaily === true} onClick={() => set({ fruitVegDaily: true })}>
              {t.foodDaily}
            </OptionCard>
            <OptionCard selected={answers.fruitVegDaily === false} onClick={() => set({ fruitVegDaily: false })}>
              {t.foodNotDaily}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 5 && (
        <section>
          {questionTitle(t.qBp)}
          <div className="grid grid-cols-2 gap-3">
            <OptionCard selected={answers.bpMedsEver === true} onClick={() => set({ bpMedsEver: true })}>
              {t.yes}
            </OptionCard>
            <OptionCard selected={answers.bpMedsEver === false} onClick={() => set({ bpMedsEver: false })}>
              {t.no}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 6 && (
        <section>
          {questionTitle(t.qGlucose, t.qGlucoseHint)}
          <div className="grid grid-cols-2 gap-3">
            <OptionCard selected={answers.highGlucoseEver === true} onClick={() => set({ highGlucoseEver: true })}>
              {t.yes}
            </OptionCard>
            <OptionCard selected={answers.highGlucoseEver === false} onClick={() => set({ highGlucoseEver: false })}>
              {t.no}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 7 && (
        <section>
          {questionTitle(t.qFamily)}
          <div className="space-y-3">
            <OptionCard selected={answers.familyHistory === "none"} onClick={() => set({ familyHistory: "none" })}>
              {t.familyNone}
            </OptionCard>
            <OptionCard selected={answers.familyHistory === "second"} onClick={() => set({ familyHistory: "second" })}>
              {t.familySecond}
            </OptionCard>
            <OptionCard selected={answers.familyHistory === "first"} onClick={() => set({ familyHistory: "first" })}>
              {t.familyFirst}
            </OptionCard>
          </div>
        </section>
      )}

      {step === 8 && (
        <section>
          {questionTitle(t.qSymptoms, t.qSymptomsHint)}
          <div className="space-y-3">
            {SYMPTOMS.map((s) => (
              <CheckCard
                key={s}
                selected={answers.symptoms.includes(s)}
                onClick={() => set({ symptoms: toggleInList(answers.symptoms, s) })}
              >
                {t[`symptom_${s}`]}
              </CheckCard>
            ))}
            <CheckCard
              selected={answers.symptoms.length === 0}
              onClick={() => set({ symptoms: [] })}
            >
              {t.symptomsNone}
            </CheckCard>
          </div>
        </section>
      )}

      {step === 9 && (
        <section>
          {questionTitle(t.qSevere, t.qSevereHint)}
          <div className="space-y-3">
            {SEVERE.map((s) => (
              <CheckCard
                key={s}
                selected={answers.severeSymptoms.includes(s)}
                onClick={() => set({ severeSymptoms: toggleInList(answers.severeSymptoms, s) })}
              >
                {t[`severe_${s}`]}
              </CheckCard>
            ))}
            <CheckCard selected={answers.severeSymptoms.length === 0} onClick={() => set({ severeSymptoms: [] })}>
              {t.severeNone}
            </CheckCard>
          </div>
        </section>
      )}

      <StepError message={error} />
      <NavButtons
        onBack={handleBack}
        onNext={handleNext}
        nextLabel={step === TOTAL_STEPS - 1 ? t.seeResult : t.next}
      />
    </main>
  );
}
