export type Role = "owner" | "admin" | "member";

export interface Workspace {
  id: string;
  slug: string;
  name: string;
  role: Role;
}

export interface Me {
  user: { id: string; email: string | null; displayName: string; avatarUrl: string | null };
  workspaces: Workspace[];
}

export interface Providers {
  github: boolean;
  google: boolean;
  devLogin: boolean;
}

export interface Budget {
  scope: string;
  ref: string;
  limit: number;
  remaining: number | null;
  active: boolean;
}

export interface Policy {
  scopeType: string;
  scopeRef: string;
  allowedModels: string;
  fallbackAction: "deny" | "downgrade" | "require_approval";
  downgradeTo: string | null;
  approvalThresholdNanos: number | null;
  active: boolean;
}

export interface Approval {
  id: string;
  state: string;
  team: string;
  requestedModel: string;
  estimateNanos: number | null;
  reason: string;
  createdAt: string;
  expiresAt: string;
}

export interface ApiKeyView {
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

export interface MintedKey {
  id: string;
  key: string;
  name: string;
  admin: boolean;
}

export interface Team {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}

export interface Member {
  userId: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  joinedAt: string;
}

export interface Invite {
  id: string;
  role: "ADMIN" | "MEMBER";
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface AuditRow {
  id: string;
  teamId: string | null;
  projectId: string | null;
  userId: string | null;
  requestedModel: string;
  executedModel: string | null;
  decision: string;
  reason: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cost: string | null;
  createdAt: string;
}

export interface Activity {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  targetRef: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface SpendBucket {
  key: string;
  costUsd: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
}

export interface TrendPoint {
  bucket: string;
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

export interface Savings {
  routingSavingsUsd: string;
  cacheSavingsUsd: string;
  totalSavingsUsd: string;
  actualSpendUsd: string;
  wouldBeSpendUsd: string;
  percentSaved: number | null;
}

export interface BudgetUtilization {
  scopeRef: string;
  limitUsd: string;
  spentUsd: string;
  utilization: number | null;
}
