import { readFileSync } from "node:fs";
import nextEnv from "@next/env";
import { z } from "zod";

type Dialogue = { id: string; label_review: "unreviewed"; utterances: { text: string; gold: "doctor" | "patient" | "other" | "unknown" }[] };
const dialogues = JSON.parse(readFileSync("data/eval/dialogues.json", "utf8")) as Dialogue[];
console.log(`Planned real Groq calls: ${dialogues.length}`);
console.log(`Unreviewed dialogue labels: ${dialogues.filter((d) => d.label_review === "unreviewed").length}`);
nextEnv.loadEnvConfig(process.cwd());
const { hasGroqCheckProviderConfigured, runGroqSessionRoleInference } = await import("../lib/llm.ts");
if (!hasGroqCheckProviderConfigured()) { console.error("Refusing role evaluation in mock mode: configure GROQ_API_KEY and GROQ_MODEL."); process.exitCode = 1; }
else {
  const resultRows: { id: string; text: string; gold: string; predicted: string; confidence: string }[] = [];
  const schema = z.object({ utterances: z.array(z.object({ role: z.enum(["doctor","patient","other","unknown"]), confidence: z.enum(["high","medium","low"]) })) });
  for (const dialogue of dialogues) {
    const result = await runGroqSessionRoleInference({ payload: { utterances: dialogue.utterances.map(({ text }) => text) }, schema });
    dialogue.utterances.forEach((utterance, index) => resultRows.push({ id: dialogue.id, text: utterance.text, gold: utterance.gold, predicted: result.output.utterances[index]?.role ?? "missing", confidence: result.output.utterances[index]?.confidence ?? "missing" }));
  }
  const accuracy = (rows: typeof resultRows) => rows.length ? rows.filter((row) => row.gold === row.predicted).length / rows.length : 0;
  const shortRows = resultRows.filter((row) => row.text.trim().split(/\s+/).length < 4);
  const relativeRows = resultRows.filter((row) => row.gold === "other");
  console.log(`Provider: Groq (${process.env.GROQ_MODEL}); completed calls: ${dialogues.length}; utterances: ${resultRows.length}`);
  console.log(`Overall accuracy: ${(100 * accuracy(resultRows)).toFixed(1)}% (${resultRows.filter((row) => row.gold === row.predicted).length}/${resultRows.length})`);
  console.log(`Short (<4 words) accuracy: ${(100 * accuracy(shortRows)).toFixed(1)}% (${shortRows.filter((row) => row.gold === row.predicted).length}/${shortRows.length})`);
  console.log(`Relative speaker accuracy: ${(100 * accuracy(relativeRows)).toFixed(1)}% (${relativeRows.filter((row) => row.gold === row.predicted).length}/${relativeRows.length})`);
  for (const confidence of ["high","medium","low"]) console.log(`${confidence} confidence accuracy: ${(100 * accuracy(resultRows.filter((row) => row.confidence === confidence))).toFixed(1)}% (${resultRows.filter((row) => row.confidence === confidence).length})`);
  console.log("Worst misattributions:");
  resultRows.filter((row) => row.gold !== row.predicted).slice(0, 10).forEach((row) => console.log(`${row.id}: gold=${row.gold}, predicted=${row.predicted} (${row.confidence}) — ${row.text}`));
}
