export function structuredPrompt(
  instructions: string,
  payload: unknown,
): {
  instructions: string;
  messages: [{ role: "user"; content: string }];
} {
  return {
    instructions,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
  };
}
