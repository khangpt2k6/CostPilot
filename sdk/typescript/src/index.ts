import { HttpCore, type ClientOptions } from "./core.js";
import { Analytics, Approvals, Audit, Budgets, Keys, Policies } from "./resources/admin.js";
import { Chat } from "./resources/chat.js";

/**
 * Client for a CostPilot gateway.
 *
 * ```ts
 * const cp = new CostPilot({ apiKey: process.env.COSTPILOT_API_KEY });
 * const res = await cp.chat.completions.create({ model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] });
 * res.governance.modelDowngraded; // what the gateway did
 * ```
 */
export class CostPilot {
  readonly chat: Chat;
  readonly budgets: Budgets;
  readonly policies: Policies;
  readonly approvals: Approvals;
  readonly keys: Keys;
  readonly audit: Audit;
  readonly analytics: Analytics;
  readonly baseURL: string;

  constructor(options: ClientOptions = {}) {
    const core = new HttpCore(options);
    this.baseURL = core.baseURL;
    this.chat = new Chat(core);
    this.budgets = new Budgets(core);
    this.policies = new Policies(core);
    this.approvals = new Approvals(core);
    this.keys = new Keys(core);
    this.audit = new Audit(core);
    this.analytics = new Analytics(core);
  }
}

export default CostPilot;
export type { ClientOptions } from "./core.js";
export { VERSION } from "./core.js";
export * from "./errors.js";
export { ChatStream } from "./streaming.js";
export type * from "./types.js";
