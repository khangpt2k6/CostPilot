-- 4.2: human accounts for the console.
--
-- A tenant is a workspace. People log in with GitHub/Google (or dev-login on localhost),
-- belong to one or more workspaces with a role, and join others through invite links.
-- API keys stay the machine credential; nothing here changes how the gateway authenticates.

create table app_user (
    id             uuid primary key default gen_random_uuid(),
    email          text,
    display_name   text not null,
    avatar_url     text,
    created_at     timestamptz not null default now(),
    last_login_at  timestamptz
);

-- one row per external login; a user could link several providers later
create table user_identity (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references app_user (id) on delete cascade,
    provider    text not null,
    subject     text not null,
    created_at  timestamptz not null default now(),
    unique (provider, subject)
);

create table workspace_member (
    tenant_id   uuid not null references tenant (id) on delete cascade,
    user_id     uuid not null references app_user (id) on delete cascade,
    role        text not null check (role in ('owner', 'admin', 'member')),
    created_at  timestamptz not null default now(),
    primary key (tenant_id, user_id)
);

create index idx_workspace_member_user on workspace_member (user_id);

-- only the hash of the invite token is stored, same stance as api_key
create table workspace_invite (
    id           uuid primary key default gen_random_uuid(),
    tenant_id    uuid not null references tenant (id) on delete cascade,
    token_hash   text not null unique,
    role         text not null check (role in ('admin', 'member')),
    created_by   uuid references app_user (id) on delete set null,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz not null,
    accepted_by  uuid references app_user (id) on delete set null,
    accepted_at  timestamptz,
    revoked_at   timestamptz
);

create index idx_workspace_invite_tenant on workspace_invite (tenant_id, created_at);

-- human-facing workspace name; tenant.name stays the unique slug the ledger stores
alter table tenant add column display_name text;

-- the first 12 chars of a key ("cp_live_AbCd") so a list can tell keys apart without
-- ever showing the secret; null for keys minted before this migration
alter table api_key add column key_prefix text;

-- admin actions now record who did them (user:<email> / key:<name>) separately from the
-- tenant they happened in; before this the actor column held the tenant name
alter table admin_audit add column tenant_id text;
update admin_audit set tenant_id = actor;
create index idx_admin_audit_tenant_time on admin_audit (tenant_id, created_at);
