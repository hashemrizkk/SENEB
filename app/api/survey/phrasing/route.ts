export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  return Response.json(
    { error: "survey_phrasing_retired" },
    { status: 410, headers: { "cache-control": "no-store" } },
  );
}
