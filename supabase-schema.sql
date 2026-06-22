-- The Spine — database schema (Stage 3)
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- It creates the tables the app needs to remember people and their work.

-- 1) ACCOUNTS — who signed up
create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  contact text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- 2) PROFILES — the public creator identity
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  display_name text not null,
  handle text unique not null,
  specialty text,
  bio text,
  created_at timestamptz default now()
);

-- 3) WALLETS — each account's credit balance
create table if not exists wallets (
  account_id uuid primary key references accounts(id) on delete cascade,
  balance integer default 0 check (balance >= 0),
  updated_at timestamptz default now()
);

-- 4) TOOLS — published tools in the marketplace
create table if not exists tools (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete cascade,
  name text not null,
  description text,
  kind text,
  trust_level text default 'New',
  outcome_score numeric default 0,
  thumbs_up integer default 0,
  thumbs_down integer default 0,
  runs integer default 0,
  created_at timestamptz default now()
);

-- 5) FEEDBACK — the thumbs up / down that drives outcome scores
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid references tools(id) on delete cascade,
  account_id uuid references accounts(id) on delete set null,
  thumbs boolean not null,         -- true = up, false = down
  created_at timestamptz default now()
);

-- 6) LEDGER — every credit movement, double-entry, fully traceable
create table if not exists ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references accounts(id) on delete set null,
  label text not null,
  direction text not null,         -- 'in' or 'out'
  amount integer not null,
  created_at timestamptz default now()
);

-- Helpful indexes
create index if not exists idx_tools_account on tools(account_id);
create index if not exists idx_feedback_tool on feedback(tool_id);
create index if not exists idx_ledger_account on ledger(account_id);

-- NOTE on security: before launch, enable Row Level Security (RLS) on these
-- tables and add policies so people can only read/write their own rows.
-- Your backend handoff document covers the exact policies. Keep it simple
-- to start; lock it down before real money flows.
