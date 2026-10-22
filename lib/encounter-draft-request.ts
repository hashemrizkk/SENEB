export async function requestEncounterDraft(
  request: typeof fetch,
  url: string,
  body: unknown,
): Promise<unknown> {
  const response = await request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("Encounter draft request failed.");
  return result;
}
