// Wire types. Chat shapes follow the OpenAI API (the gateway speaks it); admin shapes mirror
// the gateway's JSON exactly.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  user?: string;
  [extra: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: { index: number; message: { role: Role; content: string | null }; finish_reason: string | null }[];
  usage?: Usage;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: { index: number; delta: { role?: Role; content?: string | null }; finish_reason: string | null }[];
  usage?: Usage;
}

/** What the gateway did to the request, read from X-CostPilot-* response headers. */
export interface Governance {
  /** served from the semantic cache at $0 */
  cacheHit: boolean;
  /** set when a budget is under 20% remaining, e.g. "team=research budget below 20% remaining" */
  budgetWarning: string | null;
  /** cost-based routing picked a cheaper model that meets the quality bar */
  modelRouted: string | null;
  /** a policy or budget forced a cheaper model */
  modelDowngraded: string | null;
  /** every X-CostPilot-* header, lower-cased */
  headers: Record<string, string>;
}

export type ChatCompletionResponse = ChatCompletion & { governance: Governance };

/** Per-call attribution. Team/project override only works with an admin key. */
export interface RequestOptions {
  team?: string;
  project?: string;
  user?: string;
  environment?: string;
  /** reuse the same key when you retry a call yourself; the SDK sets one per call otherwise */
  idempotencyKey?: string;
  /** refuse to be downgraded below this model tier */
  minTier?: number;
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

export type BudgetScope = "tenant" | "team" | "project" | "model";

export interface Budget {
  scope: BudgetScope;
  ref: string;
  limit: number;
  remaining: number | null;
  active: boolean;
}

export type FallbackAction = "deny" | "downgrade" | "require_approval";

export interface Policy {
  scopeType: "team" | "project";
  scopeRef: string;
  allowedModels: string;
  fallbackAction: FallbackAction;
  downgradeTo: string | null;
  approvalThresholdNanos: number | null;
  active: boolean;
}

export interface PolicyUpsert {
  scopeType: "team" | "project";
  scopeRef: string;
  /** comma separated, trailing * is a prefix wildcard */
  allowedModels: string | string[];
  fallbackAction: FallbackAction;
  downgradeTo?: string;
  /** hold calls whose worst-case cost exceeds this many USD, even for allowed models */
  approvalThresholdUsd?: number;
}

export interface PendingApproval {
  id: string;
  state: string;
  team: string;
  requestedModel: string;
  estimateNanos: number | null;
  reason: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string | null;
  teamId: string;
  team: string;
  projectId: string | null;
  project: string | null;
  admin: boolean;
  createdAt: string;
  revokedAt: string | null;
}

export interface CreatedApiKey {
  id: string;
  /** the secret; returned only here */
  key: string;
  name: string;
  admin: boolean;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface AuditRecord {
  id: string;
  tenantId: string;
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
  environment: string | null;
  requestedModel: string;
  executedModel: string | null;
  decision: string;
  reason: string | null;
  matchedRuleId: string | null;
  blockedScope: string | null;
  finishReason: string | null;
  provider: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: string | null;
  idempotencyKey: string | null;
  createdAt: string;
}

export interface TimeWindow {
  from?: Date | string;
  to?: Date | string;
}

export interface SpendBucket {
  key: string;
  costUsd: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TopSpender {
  key: string;
  costUsd: string;
  requests: number;
}

export interface DecisionCounts {
  allow: number;
  downgrade: number;
  route: number;
  cutoff: number;
  deny: number;
  approvalRequired: number;
}

export interface TrendPoint {
  bucket: string;
  costUsd: string;
  requests: number;
}

export interface BudgetUtilization {
  scopeRef: string;
  limitUsd: string;
  spentUsd: string;
  utilization: number | null;
}

export interface SavingsSummary {
  routingSavingsUsd: string;
  cacheSavingsUsd: string;
  totalSavingsUsd: string;
  actualSpendUsd: string;
  wouldBeSpendUsd: string;
  percentSaved: number | null;
}
