import { createContext, useContext } from "react";
import type { Lang } from "./types";
import { strings, type Strings } from "./strings";

export interface LangCtx {
  lang: Lang;
  t: Strings;
  dir: "rtl" | "ltr";
  toggle: () => void;
}

export const LangContext = createContext<LangCtx>({
  lang: "ar",
  t: strings.ar,
  dir: "rtl",
  toggle: () => {},
});

export function useLang(): LangCtx {
  return useContext(LangContext);
}
