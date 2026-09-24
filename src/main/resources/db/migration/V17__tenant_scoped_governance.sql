-- 4.1: hard tenant isolation for budgets and policy rules.
--
-- Until now both tables were unique on (scope_type, scope_ref) across the whole instance,
-- and refs are names. Team 'platform' in one tenant therefore shared its budget counter and
-- its policy rule with team 'platform' in any other tenant. With self-serve workspaces that
-- is a cross-tenant leak, so every row now belongs to exactly one tenant (by name, the same
-- string identity the ledger stores in usage_record.tenant_id).

alter table budget add column tenant_id text;
update budget set tenant_id = case when scope_type = 'tenant' then scope_ref else 'acme' end;
alter table budget alter column tenant_id set not null;
alter table budget drop constraint budget_scope_type_scope_ref_key;
alter table budget add constraint budget_tenant_scope_key unique (tenant_id, scope_type, scope_ref);
-- a tenant-scope budget can only ever govern its own tenant
alter table budget add constraint budget_tenant_scope_self
    check (scope_type <> 'tenant' or scope_ref = tenant_id);

alter table policy_rule add column tenant_id text;
update policy_rule set tenant_id = 'acme';
alter table policy_rule alter column tenant_id set not null;
alter table policy_rule drop constraint policy_rule_scope_type_scope_ref_key;
alter table policy_rule add constraint policy_rule_tenant_scope_key unique (tenant_id, scope_type, scope_ref);

-- spend-per-scope reads now always carry the tenant predicate
create index if not exists idx_usage_record_tenant_team_time on usage_record (tenant_id, team_id, created_at);
create index if not exists idx_pending_approval_tenant_state on pending_approval (tenant_id, state);
create index if not exists idx_audit_record_tenant_created on audit_record (tenant_id, created_at);
