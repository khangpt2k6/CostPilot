import { CostPilotError } from "./errors.js";
import type { ChatCompletionChunk, Governance, Usage } from "./types.js";

/**
 * A streamed chat completion. Iterate it for chunks; afterwards {@link budgetCutoff} tells you
 * whether the gateway cut the stream short to keep a budget, and {@link usage} carries the
 * final token counts when the upstream reported them.
 */
export class ChatStream implements AsyncIterable<ChatCompletionChunk> {
  readonly governance: Governance;
  budgetCutoff = false;
  usage: Usage | null = null;
  private text = "";
  private consumed = false;

  constructor(
    private readonly response: Response,
    governance: Governance,
    private readonly controller: AbortController,
  ) {
    this.governance = governance;
  }

  /** stop reading and close the connection (the gateway settles what was generated) */
  abort() {
    this.controller.abort();
  }

  /** all content deltas joined; complete once iteration finished */
  get content(): string {
    return this.text;
  }

  /** drain the stream and return the full text */
  async finalContent(): Promise<string> {
    for await (const _ of this) {
      // iterate to the end
    }
    return this.text;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ChatCompletionChunk> {
    if (this.consumed) throw new CostPilotError("a stream can only be iterated once");
    this.consumed = true;
    if (!this.response.body) return;
    for await (const data of sseData(this.response.body)) {
      if (data === "[DONE]") return;
      let chunk: ChatCompletionChunk;
      try {
        chunk = JSON.parse(data) as ChatCompletionChunk;
      } catch {
        continue; // ignore keep-alives or anything non-JSON
      }
      if (chunk.usage) this.usage = chunk.usage;
      for (const choice of chunk.choices ?? []) {
        if (choice.delta?.content) this.text += choice.delta.content;
        if (choice.finish_reason === "budget_cutoff") this.budgetCutoff = true;
      }
      yield chunk;
    }
  }
}

/** Yields the payload of each `data:` event (multi-line data joined with \n). */
export async function* sseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = nextBoundary(buffer)) !== -1) {
        const event = buffer.slice(0, sep);
        buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");
        const data = dataOf(event);
        if (data !== null) yield data;
      }
    }
    buffer += decoder.decode();
    const data = dataOf(buffer);
    if (data !== null) yield data;
  } finally {
    reader.releaseLock();
  }
}

function nextBoundary(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

function dataOf(event: string): string | null {
  const lines = event
    .split(/\r?\n/)
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""));
  return lines.length ? lines.join("\n") : null;
}
