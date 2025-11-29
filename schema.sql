-- Schema for LeadTracker mini-CRM
-- Safe to run multiple times (IF NOT EXISTS on objects where possible).

create extension if not exists "uuid-ossp";

create table if not exists public.search_titles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  headline text,
  company text,
  profile_url text,
  search_title text,
  direction text,
  request_date date,
  acceptance_date date,
  contacted boolean default false,
  contacted_date date,
  converted boolean default false,
  conversion_date date,
  top_lead boolean default false,
  status text,
  tags text[],
  notes text,
  employee_range text,
  company_segment text,
  company_industry text,
  geo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_leads_user_updated on public.leads (user_id, updated_at desc);
create index if not exists idx_titles_user_label on public.search_titles (user_id, label);
create index if not exists idx_events_lead_created on public.lead_events (lead_id, created_at desc);

alter table public.search_titles enable row level security;
alter table public.leads enable row level security;
alter table public.lead_events enable row level security;

-- Policies: drop/create to ensure idempotence
drop policy if exists "select own titles" on public.search_titles;
drop policy if exists "insert own titles" on public.search_titles;
drop policy if exists "update own titles" on public.search_titles;
drop policy if exists "delete own titles" on public.search_titles;

create policy "select own titles" on public.search_titles
  for select using (auth.uid() = user_id);
create policy "insert own titles" on public.search_titles
  for insert with check (auth.uid() = user_id);
create policy "update own titles" on public.search_titles
  for update using (auth.uid() = user_id);
create policy "delete own titles" on public.search_titles
  for delete using (auth.uid() = user_id);

drop policy if exists "select own leads" on public.leads;
drop policy if exists "insert own leads" on public.leads;
drop policy if exists "update own leads" on public.leads;
drop policy if exists "delete own leads" on public.leads;

create policy "select own leads" on public.leads
  for select using (auth.uid() = user_id);
create policy "insert own leads" on public.leads
  for insert with check (auth.uid() = user_id);
create policy "update own leads" on public.leads
  for update using (auth.uid() = user_id);
create policy "delete own leads" on public.leads
  for delete using (auth.uid() = user_id);

drop policy if exists "select own events" on public.lead_events;
drop policy if exists "insert own events" on public.lead_events;

create policy "select own events" on public.lead_events
  for select using (auth.uid() = user_id);
create policy "insert own events" on public.lead_events
  for insert with check (auth.uid() = user_id);
-- No update/delete expected on events; add if necessary.

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_updated_at_leads on public.leads;
create trigger trg_set_updated_at_leads
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_titles on public.search_titles;
create trigger trg_set_updated_at_titles
before update on public.search_titles
for each row execute function public.set_updated_at();
