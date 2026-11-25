-- ============================================================
-- CRM · toegang voor een aparte Claude-gebruiker
-- Voer uit in Supabase → SQL Editor, NADAT je in Authentication → Users
-- de gebruiker claude-crm@tulderconsultancy.nl hebt aangemaakt.
-- Pas het adres hieronder aan als je een ander adres kiest.
--
-- Wat dit doet: die ene gebruiker ziet en bewerkt dezelfde gegevens als jij.
-- Alles wat hij toevoegt, wordt van jou. Jouw eigen toegang verandert niet.
-- Intrekken: verwijder de gebruiker in Authentication → Users.
-- ============================================================

create table if not exists public.crm_toegang (
  gast      uuid primary key references auth.users(id) on delete cascade,
  eigenaar  uuid not null references auth.users(id) on delete cascade
);
alter table public.crm_toegang enable row level security;
revoke all on public.crm_toegang from anon, authenticated;

-- wiens gegevens zie ik: van mijn eigenaar als ik gast ben, anders van mezelf
create or replace function public.crm_eigenaar() returns uuid
  language sql stable security definer set search_path = public
as $$ select coalesce((select eigenaar from public.crm_toegang where gast = auth.uid()), auth.uid()) $$;
revoke all on function public.crm_eigenaar() from public, anon;
grant execute on function public.crm_eigenaar() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['party_types','parties','contacts','interactions','settings'] loop
    execute format('alter table public.%I alter column owner_id set default public.crm_eigenaar()', t);
    execute format('drop policy if exists eigen_rijen on public.%I', t);
    execute format('create policy eigen_rijen on public.%I for all to authenticated
                    using (owner_id = public.crm_eigenaar()) with check (owner_id = public.crm_eigenaar())', t);
  end loop;
end $$;

-- koppel de Claude-gebruiker aan jouw account (het enige andere account)
do $$
declare
  claude_mail text := 'claude-crm@tulderconsultancy.nl';
  c uuid; e uuid; n int;
begin
  select id into c from auth.users where lower(email) = lower(claude_mail);
  if c is null then raise exception 'Gebruiker % bestaat nog niet. Maak hem eerst aan in Authentication → Users.', claude_mail; end if;
  select count(*) into n from auth.users where id <> c;
  if n <> 1 then raise exception 'Verwacht precies één ander account (het jouwe), gevonden: %. Niets gewijzigd.', n; end if;
  select id into e from auth.users where id <> c;
  insert into public.crm_toegang (gast, eigenaar) values (c, e)
    on conflict (gast) do update set eigenaar = excluded.eigenaar;
  raise notice 'Klaar: % heeft nu toegang tot jouw CRM.', claude_mail;
end $$;
