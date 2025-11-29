-- Optimisations Supabase pour LeadTracker
-- À appliquer après le schéma de base (schema.sql)

-- ============================================
-- 1. CORRECTION DES POLICIES RLS (PERFORMANCE)
-- ============================================
-- Problème : auth.uid() est réévalué pour chaque ligne
-- Solution : Utiliser (select auth.uid()) pour une seule évaluation

-- search_titles
drop policy if exists "select own titles" on public.search_titles;
drop policy if exists "insert own titles" on public.search_titles;
drop policy if exists "update own titles" on public.search_titles;
drop policy if exists "delete own titles" on public.search_titles;

create policy "select own titles" on public.search_titles
  for select using ((select auth.uid()) = user_id);
create policy "insert own titles" on public.search_titles
  for insert with check ((select auth.uid()) = user_id);
create policy "update own titles" on public.search_titles
  for update using ((select auth.uid()) = user_id);
create policy "delete own titles" on public.search_titles
  for delete using ((select auth.uid()) = user_id);

-- leads
drop policy if exists "select own leads" on public.leads;
drop policy if exists "insert own leads" on public.leads;
drop policy if exists "update own leads" on public.leads;
drop policy if exists "delete own leads" on public.leads;

create policy "select own leads" on public.leads
  for select using ((select auth.uid()) = user_id);
create policy "insert own leads" on public.leads
  for insert with check ((select auth.uid()) = user_id);
create policy "update own leads" on public.leads
  for update using ((select auth.uid()) = user_id);
create policy "delete own leads" on public.leads
  for delete using ((select auth.uid()) = user_id);

-- lead_events
drop policy if exists "select own events" on public.lead_events;
drop policy if exists "insert own events" on public.lead_events;

create policy "select own events" on public.lead_events
  for select using ((select auth.uid()) = user_id);
create policy "insert own events" on public.lead_events
  for insert with check ((select auth.uid()) = user_id);

-- ============================================
-- 2. INDEX MANQUANTS (PERFORMANCE)
-- ============================================

-- Index sur user_id de lead_events (clé étrangère non indexée)
create index if not exists idx_events_user_id on public.lead_events (user_id);

-- Index sur profile_url pour déduplication rapide (requête fréquente)
create index if not exists idx_leads_profile_url on public.leads (profile_url);

-- Index composite pour recherches par user + search_title (filtrage fréquent)
create index if not exists idx_leads_user_search_title on public.leads (user_id, search_title);

-- Index pour filtres sur dates d'acceptation (requêtes fréquentes)
create index if not exists idx_leads_acceptance_date on public.leads (user_id, acceptance_date) 
  where acceptance_date is not null;

-- Index pour filtres "à contacter" (contacted = false + acceptance_date)
create index if not exists idx_leads_to_contact on public.leads (user_id, acceptance_date) 
  where contacted = false and acceptance_date is not null;

-- Index pour recherche par direction (filtrage fréquent)
create index if not exists idx_leads_direction on public.leads (user_id, direction);

-- Index pour recherche par company (filtrage optionnel)
create index if not exists idx_leads_company on public.leads (user_id, company) 
  where company is not null and company != '';

-- Index GIN pour recherche textuelle dans tags (si utilisé)
create index if not exists idx_leads_tags_gin on public.leads using gin (tags) 
  where tags is not null;

-- ============================================
-- 3. SÉCURITÉ : FONCTION set_updated_at
-- ============================================
-- Problème : search_path mutable (risque d'injection)
-- Solution : Définir search_path explicitement

drop function if exists public.set_updated_at() cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Recréer les triggers
drop trigger if exists trg_set_updated_at_leads on public.leads;
create trigger trg_set_updated_at_leads
before update on public.leads
for each row execute function public.set_updated_at();

drop trigger if exists trg_set_updated_at_titles on public.search_titles;
create trigger trg_set_updated_at_titles
before update on public.search_titles
for each row execute function public.set_updated_at();

-- ============================================
-- 4. INDEX POUR REQUÊTES DE SYNC
-- ============================================
-- L'extension fait beaucoup de sync avec filtres sur updated_at

-- Index existant déjà bon : idx_leads_user_updated
-- Mais on peut l'améliorer pour les requêtes avec since
-- (l'index existant devrait suffire, mais on vérifie)

-- Index pour lead_events par lead_id + created_at (déjà existant mais vérifions)
-- idx_events_lead_created existe déjà

-- ============================================
-- 5. STATISTIQUES POUR OPTIMISEUR
-- ============================================
-- Aider le planificateur PostgreSQL avec des statistiques

analyze public.leads;
analyze public.search_titles;
analyze public.lead_events;

-- ============================================
-- 6. COMMENTAIRES POUR DOCUMENTATION
-- ============================================

comment on index idx_leads_profile_url is 
  'Index pour déduplication rapide lors de l''ajout de leads (recherche par URL)';
comment on index idx_leads_user_search_title is 
  'Index pour filtrage par titre de recherche dans le dashboard';
comment on index idx_leads_acceptance_date is 
  'Index pour filtres sur dates d''acceptation et calcul J+5';
comment on index idx_leads_to_contact is 
  'Index optimisé pour la requête "leads à contacter" (J+5, non contactés)';
comment on index idx_events_user_id is 
  'Index sur clé étrangère user_id pour améliorer les jointures';
