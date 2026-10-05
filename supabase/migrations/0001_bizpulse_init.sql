-- ============================================================
-- BizPulse AI — core schema
-- Multi-tenant: Organization -> Membership -> Business -> data
-- Tables are prefixed bp_ and live in the public schema so the
-- Supabase JS client can reach them with no extra dashboard config.
-- Row Level Security is enabled on every table; access is granted
-- only to members of the owning organization.
-- ============================================================

-- ---------- profiles (mirror of auth.users) ----------
create table if not exists public.bp_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------- organizations (a workspace / tenant) ----------
create table if not exists public.bp_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

-- ---------- memberships (users <-> organizations, with roles) ----------
create table if not exists public.bp_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.bp_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',          -- owner | admin | member
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

-- ---------- businesses ----------
create table if not exists public.bp_businesses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.bp_organizations(id) on delete cascade,
  name text not null,
  industry text,
  currency text not null default 'INR',
  reporting_period text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- monthly business data ----------
create table if not exists public.bp_business_months (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.bp_businesses(id) on delete cascade,
  label text not null,
  revenue jsonb not null default '[]'::jsonb,
  expenses jsonb not null default '[]'::jsonb,
  cash_on_hand numeric,
  created_at timestamptz not null default now()
);

-- ---------- analyses (an agent run + its result) ----------
create table if not exists public.bp_analyses (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.bp_businesses(id) on delete cascade,
  created_by uuid references auth.users(id),
  score int,
  payload jsonb,
  ai_provider text,
  ai_model text,
  created_at timestamptz not null default now()
);

-- ---------- reports ----------
create table if not exists public.bp_reports (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.bp_businesses(id) on delete cascade,
  analysis_id uuid references public.bp_analyses(id) on delete set null,
  payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------- meetings ----------
create table if not exists public.bp_meetings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.bp_businesses(id) on delete cascade,
  title text,
  meeting_date date,
  meeting_time text,
  agenda text,
  created_at timestamptz not null default now()
);

-- ---------- subscriptions ----------
create table if not exists public.bp_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.bp_organizations(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',        -- active | past_due | canceled
  provider text,                                -- razorpay | stripe
  external_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- usage events (for plan limits) ----------
create table if not exists public.bp_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.bp_organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  kind text not null,                           -- analysis | report | upload | agent_run | api_request
  created_at timestamptz not null default now()
);

create index if not exists bp_usage_org_kind_time on public.bp_usage_events (org_id, kind, created_at);
create index if not exists bp_members_user on public.bp_memberships (user_id);
create index if not exists bp_months_business on public.bp_business_months (business_id);

-- ============================================================
-- Helpers (SECURITY DEFINER so RLS checks don't recurse)
-- ============================================================
create or replace function public.bp_is_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bp_memberships m where m.org_id = org and m.user_id = auth.uid());
$$;

create or replace function public.bp_is_admin(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bp_memberships m where m.org_id = org and m.user_id = auth.uid() and m.role in ('owner','admin'));
$$;

-- membership check for a row reached through its business
create or replace function public.bp_business_org(b uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.bp_businesses where id = b;
$$;

-- ============================================================
-- New auth user -> create a profile, an organization and an
-- owner membership automatically (automated onboarding).
-- ============================================================
create or replace function public.bp_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
begin
  insert into public.bp_profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.bp_organizations (name, owner_id)
  values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), 'My workspace'), new.id)
  returning id into new_org;

  insert into public.bp_memberships (org_id, user_id, role)
  values (new_org, new.id, 'owner')
  on conflict (org_id, user_id) do nothing;

  insert into public.bp_subscriptions (org_id, plan, status)
  values (new_org, 'free', 'active');

  return new;
end; $$;

drop trigger if exists bp_on_auth_user_created on auth.users;
create trigger bp_on_auth_user_created
  after insert on auth.users
  for each row execute function public.bp_handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.bp_profiles        enable row level security;
alter table public.bp_organizations   enable row level security;
alter table public.bp_memberships     enable row level security;
alter table public.bp_businesses      enable row level security;
alter table public.bp_business_months enable row level security;
alter table public.bp_analyses        enable row level security;
alter table public.bp_reports         enable row level security;
alter table public.bp_meetings        enable row level security;
alter table public.bp_subscriptions   enable row level security;
alter table public.bp_usage_events    enable row level security;

-- profiles: a user may read/update only their own profile
drop policy if exists bp_profiles_self on public.bp_profiles;
create policy bp_profiles_self on public.bp_profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- organizations: members read; owner/admin write
drop policy if exists bp_org_read on public.bp_organizations;
create policy bp_org_read on public.bp_organizations
  for select using (public.bp_is_member(id));

drop policy if exists bp_org_insert on public.bp_organizations;
create policy bp_org_insert on public.bp_organizations
  for insert with check (owner_id = auth.uid());

drop policy if exists bp_org_write on public.bp_organizations;
create policy bp_org_write on public.bp_organizations
  for update using (public.bp_is_admin(id)) with check (public.bp_is_admin(id));

-- memberships: members read; admins write
drop policy if exists bp_mem_read on public.bp_memberships;
create policy bp_mem_read on public.bp_memberships
  for select using (public.bp_is_member(org_id));

drop policy if exists bp_mem_write on public.bp_memberships;
create policy bp_mem_write on public.bp_memberships
  for all using (public.bp_is_admin(org_id)) with check (public.bp_is_admin(org_id));

-- businesses: any member of the org has full access
drop policy if exists bp_biz_all on public.bp_businesses;
create policy bp_biz_all on public.bp_businesses
  for all using (public.bp_is_member(org_id)) with check (public.bp_is_member(org_id));

-- child tables: access via the owning business's org
drop policy if exists bp_months_all on public.bp_business_months;
create policy bp_months_all on public.bp_business_months
  for all using (public.bp_is_member(public.bp_business_org(business_id)))
  with check (public.bp_is_member(public.bp_business_org(business_id)));

drop policy if exists bp_analyses_all on public.bp_analyses;
create policy bp_analyses_all on public.bp_analyses
  for all using (public.bp_is_member(public.bp_business_org(business_id)))
  with check (public.bp_is_member(public.bp_business_org(business_id)));

drop policy if exists bp_reports_all on public.bp_reports;
create policy bp_reports_all on public.bp_reports
  for all using (public.bp_is_member(public.bp_business_org(business_id)))
  with check (public.bp_is_member(public.bp_business_org(business_id)));

drop policy if exists bp_meetings_all on public.bp_meetings;
create policy bp_meetings_all on public.bp_meetings
  for all using (public.bp_is_member(public.bp_business_org(business_id)))
  with check (public.bp_is_member(public.bp_business_org(business_id)));

-- subscriptions: members read; admins write
drop policy if exists bp_subs_read on public.bp_subscriptions;
create policy bp_subs_read on public.bp_subscriptions
  for select using (public.bp_is_member(org_id));

drop policy if exists bp_subs_write on public.bp_subscriptions;
create policy bp_subs_write on public.bp_subscriptions
  for all using (public.bp_is_admin(org_id)) with check (public.bp_is_admin(org_id));

-- usage events: members read and append
drop policy if exists bp_usage_read on public.bp_usage_events;
create policy bp_usage_read on public.bp_usage_events
  for select using (public.bp_is_member(org_id));

drop policy if exists bp_usage_insert on public.bp_usage_events;
create policy bp_usage_insert on public.bp_usage_events
  for insert with check (public.bp_is_member(org_id));
