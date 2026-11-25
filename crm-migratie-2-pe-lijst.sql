-- CRM migratie 2: AuM per partij en de PE-lijst onder Sales pipeline (25-11-2026)
-- Plak dit in Supabase > SQL Editor > New query en klik Run. Veilig om vaker te draaien.
-- Vereist dat crm-toegang-claude.sql eerder is uitgevoerd (functie crm_eigenaar()).

-- 1. AuM (assets under management) per partij, in miljoenen euro's, met toelichting/bron
alter table public.parties add column if not exists aum_mln  numeric;
alter table public.parties add column if not exists aum_note text;

-- 2. Prospects: partijen die nog NIET in het CRM staan (bijv. de lijst Nederlandse PE's).
--    Met de knop "Toevoegen aan CRM" worden partij en personen aangemaakt in parties/contacts.
create table if not exists public.prospects (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default public.crm_eigenaar() references auth.users(id) on delete cascade,
  list        text not null default 'pe-nl',
  name        text not null,
  city        text,
  website     text,
  member_of   text,                              -- bijv. NVP
  focus       text[] not null default '{}',      -- VC, MKB, Mid-cap, Large-cap
  markets     text[] not null default '{}',
  focus_note  text,                              -- investeringscriteria zoals in de bron
  aum_mln     numeric,                           -- totaal actieve fondsen, in mln euro
  aum_note    text,                              -- opbouw en bron van het AuM-bedrag
  people      jsonb not null default '[]',       -- [{first_name,last_name,role,email,linkedin,source}]
  sources     jsonb not null default '[]',       -- [url, ...]
  remarks     text,
  party_id    uuid references public.parties(id) on delete set null,  -- gevuld zodra toegevoegd aan het CRM
  checked_at  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, list, name)
);
create index if not exists prospects_list_idx on public.prospects(list);

alter table public.prospects enable row level security;
drop policy if exists eigen_rijen on public.prospects;
create policy eigen_rijen on public.prospects for all to authenticated
  using (owner_id = public.crm_eigenaar()) with check (owner_id = public.crm_eigenaar());
revoke all on public.prospects from anon;
grant select, insert, update, delete on public.prospects to authenticated;

notify pgrst, 'reload schema';
