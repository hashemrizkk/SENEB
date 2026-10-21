import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { hasAdminAccess } from "@/lib/adminAuth";
import { latestIntakes } from "@/lib/db";
import { intakeFieldsSchema, intakeMetaSchema } from "@/lib/intake";
import { ar } from "@/lib/strings.ar";

export const dynamic = "force-dynamic";

const redFlagsSchema = z.object({
  flags: z.array(z.string()),
  unanswered: z.array(z.string()),
});

function parseJson(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export default async function AdminIntakesPage() {
  const requestHeaders = await headers();
  if (!hasAdminAccess(requestHeaders.get("authorization"))) notFound();

  const intakes = latestIntakes(100);
  return (
    <main dir="rtl" lang="ar" style={{ maxWidth: 960, margin: "0 auto", padding: 24 }}>
      <h1>{ar.admin.title}</h1>
      {intakes.length === 0 ? <p>{ar.admin.empty}</p> : null}
      <ol style={{ paddingInlineStart: 24 }}>
        {intakes.map((intake) => {
          const parsedFlags = redFlagsSchema.safeParse(
            parseJson(intake.red_flags_json),
          );
          const parsedMeta = intakeMetaSchema.safeParse(
            parseJson(intake.meta_json),
          );
          const parsedFields = intakeFieldsSchema.safeParse(
            parseJson(intake.structured_json),
          );
          const flags = parsedFlags.success ? parsedFlags.data : null;
          const meta = parsedMeta.success ? parsedMeta.data : null;
          const fields = parsedFields.success ? parsedFields.data : null;

          return (
            <li
              key={intake.id}
              style={{
                border: "1px solid #d1d5db",
                borderRadius: 12,
                marginBlock: 16,
                padding: 16,
              }}
            >
              <h2>{intake.patient_name}</h2>
              <p>{ar.admin.created(intake.created_at ?? ar.admin.unknown)}</p>
              <p>
                {ar.admin.processing}: {meta?.llm_mode ?? ar.admin.unknown}
                {meta?.needs_review ? ` — ${ar.admin.needsReview}` : ""}
                {meta?.contradiction ? ` — ${ar.admin.contradiction}` : ""}
              </p>
              <h3>{ar.admin.flags}</h3>
              {flags?.flags.length ? (
                <ul>
                  {flags.flags.map((flag) => <li key={flag}>{flag}</li>)}
                </ul>
              ) : (
                <p>{ar.admin.noFlags}</p>
              )}
              {flags?.unanswered.length ? (
                <p>{ar.admin.unanswered}: {flags.unanswered.join("، ")}</p>
              ) : null}
              <p>
                {ar.admin.answers}:{" "}
                {fields
                  ? JSON.stringify(fields)
                  : ar.admin.unavailable}
              </p>
              <p>{ar.admin.patientText}</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {intake.raw_text ?? ar.admin.none}
              </pre>
            </li>
          );
        })}
      </ol>
    </main>
  );
}
