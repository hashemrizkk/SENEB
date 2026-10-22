import { ar } from "./strings.ar.ts";

export function composeRecapBody(input: {
  recap: string;
  returnPrecautions?: string | null;
  nextVisitDate?: string | null;
  patientInstructions?: string | null;
}): string {
  let recap = input.recap.trim();
  let patientInstructions = input.patientInstructions?.trim() ?? "";
  const fixedLines = [
    input.nextVisitDate ? ar.nextVisitLine(input.nextVisitDate) : null,
    input.returnPrecautions
      ? `${ar.returnPrecautionsPrefix} ${input.returnPrecautions.trim()}`
      : null,
  ].filter((line): line is string => line !== null);
  const suffix = `\n${ar.emergencyNotice}\n${ar.clinicReviewNote}`;

  function compose(): string {
    const content = [recap, ...fixedLines, patientInstructions]
      .filter(Boolean)
      .join("\n");
    return `Your visit recap: ${content}${suffix}`;
  }

  let body = compose();
  if (body.length > 600 && patientInstructions) {
    patientInstructions = patientInstructions.slice(
      0,
      Math.max(0, patientInstructions.length - (body.length - 600)),
    ).trimEnd();
    body = compose();
  }
  if (body.length > 600) {
    recap = recap.slice(0, Math.max(0, recap.length - (body.length - 600))).trimEnd();
    body = compose();
  }
  if (body.length > 600) {
    throw new Error("The return precautions and required message lines exceed 600 characters.");
  }
  return body;
}
