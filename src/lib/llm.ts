import Anthropic from "@anthropic-ai/sdk";

export function llmConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function llmModel(): string {
  return process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!llmConfigured()) throw new Error("ANTHROPIC_API_KEY is not set.");
  client ??= new Anthropic();
  return client;
}

export async function completeText(system: string, user: string, maxTokens = 1200): Promise<string> {
  const msg = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

/** Forces the model to answer through one tool, so the result is schema-shaped JSON. */
export async function completeStructured<T>(opts: {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: llmModel(),
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    tools: [{ name: opts.toolName, description: opts.toolDescription, input_schema: { type: "object", ...opts.schema } }],
    tool_choice: { type: "tool", name: opts.toolName },
  });
  const block = msg.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model returned no structured result.");
  if (msg.stop_reason === "max_tokens") throw new Error("Model output was cut off before it finished. Ask for fewer drafts.");
  return block.input as T;
}
