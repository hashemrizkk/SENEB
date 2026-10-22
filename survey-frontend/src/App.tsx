import { useEffect, useMemo, useState } from "react";
import { LangContext } from "./lib/lang";
import { strings } from "./lib/strings";
import { emptySurvey, emptyIntake } from "./lib/types";
import { hasEmergency } from "./lib/findrisc";
import type { Lang, SurveyAnswers, IntakeAnswers } from "./lib/types";
import { DemoBanner, Header } from "./components/Chrome";
import { Home } from "./screens/Home";
import { Survey } from "./screens/Survey";
import { Result, EmergencyScreen } from "./screens/Result";
import { IntakeForm } from "./screens/IntakeForm";
import { Success } from "./screens/Success";

type Screen = "home" | "survey" | "result" | "emergency" | "form" | "success";

export default function App() {
  const [lang, setLang] = useState<Lang>("ar");
  const [screen, setScreen] = useState<Screen>("home");
  const [survey, setSurvey] = useState<SurveyAnswers>(emptySurvey);
  const [intake, setIntake] = useState<IntakeAnswers>(() => emptyIntake());
  const [referenceCode, setReferenceCode] = useState("");

  const dir: "rtl" | "ltr" = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  const ctx = useMemo(
    () => ({
      lang,
      t: strings[lang],
      dir,
      toggle: () => setLang((l) => (l === "ar" ? "en" : "ar")),
    }),
    [lang, dir],
  );

  const goForm = () => {
    setIntake(emptyIntake(survey));
    setScreen("form");
  };

  return (
    <LangContext.Provider value={ctx}>
      <div dir={dir} lang={lang} className="min-h-dvh flex flex-col">
        <DemoBanner />
        <Header />
        <div className="flex-1">
          {screen === "home" && <Home onStartSurvey={() => setScreen("survey")} onStartForm={goForm} />}

          {screen === "survey" && (
            <Survey
              answers={survey}
              setAnswers={setSurvey}
              onFinish={() => setScreen(hasEmergency(survey) ? "emergency" : "result")}
              onEmergency={() => setScreen("emergency")}
              onExit={() => setScreen("home")}
            />
          )}

          {screen === "result" && (
            <Result survey={survey} onOptIn={goForm} onRetake={() => { setSurvey(emptySurvey); setScreen("survey"); }} />
          )}

          {screen === "emergency" && <EmergencyScreen onExit={() => { setSurvey(emptySurvey); setScreen("home"); }} />}

          {screen === "form" && (
            <IntakeForm
              initial={intake}
              onComplete={(code) => {
                setReferenceCode(code);
                setScreen("success");
              }}
              onExit={() => setScreen(survey.ageBand ? "result" : "home")}
            />
          )}

          {screen === "success" && (
            <Success
              code={referenceCode}
              onHome={() => {
                setSurvey(emptySurvey);
                setIntake(emptyIntake());
                setScreen("home");
              }}
            />
          )}
        </div>
        <footer className="container-app py-6 text-[13.5px]" style={{ color: "hsl(var(--muted-foreground))", borderTop: "1px solid hsl(var(--border))" }}>
          {ctx.t.disclaimer} · {ctx.t.appNameEn} — ST17_2.0
        </footer>
      </div>
    </LangContext.Provider>
  );
}
