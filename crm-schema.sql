-- CRM Ralph – databaseschema voor Supabase
-- Plak dit geheel in Supabase > SQL Editor > New query en klik Run.
-- Elke tabel is afgeschermd: alleen de ingelogde eigenaar ziet en wijzigt zijn eigen rijen.

create table if not exists public.party_types (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.parties (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  type_id     uuid references public.party_types(id) on delete set null,
  city        text,
  website     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  party_id        uuid references public.parties(id) on delete set null,
  first_name      text,
  last_name       text not null,
  role            text,
  email           text,
  phone           text,
  linkedin        text,
  notes           text,
  recurring       boolean not null default false,   -- herhaaldelijk spreken
  interval_months int     not null default 3 check (interval_months between 1 and 36),
  snooze_until    date,                              -- uitgesteld tot
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.interactions (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  date        date not null default current_date,
  kind        text not null default 'Meeting',      -- Meeting, Call, Mail, Lunch, Overig
  notes       text,
  created_at  timestamptz not null default now()
);

create table if not exists public.settings (
  owner_id                uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  default_interval_months int not null default 3 check (default_interval_months between 1 and 36),
  updated_at              timestamptz not null default now()
);

create index if not exists contacts_party_idx       on public.contacts(party_id);
create index if not exists interactions_contact_idx on public.interactions(contact_id, date desc);
create index if not exists parties_type_idx         on public.parties(type_id);

-- Beveiliging: Row Level Security, alleen eigen rijen
do $$
declare t text;
begin
  foreach t in array array['party_types','parties','contacts','interactions','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists eigen_rijen on public.%I', t);
    execute format('create policy eigen_rijen on public.%I for all to authenticated
                    using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
