-- CRM migratie 1: sales pipeline, focus en markten per partij (24-11-2026)
-- Plak dit in Supabase > SQL Editor > New query en klik Run. Veilig om vaker te draaien.
alter table public.parties add column if not exists pipeline_stage     text;
alter table public.parties add column if not exists pipeline_next_step text;
alter table public.parties add column if not exists pipeline_next_date date;
alter table public.parties add column if not exists pipeline_since     date;
alter table public.parties drop constraint if exists parties_pipeline_stage_check;
alter table public.parties add constraint parties_pipeline_stage_check
  check (pipeline_stage is null or pipeline_stage in ('te_benaderen','benaderd','in_gesprek','voorstel','gewonnen','afgevallen'));
create index if not exists parties_pipeline_idx on public.parties(pipeline_stage) where pipeline_stage is not null;
alter table public.parties add column if not exists focus   text[] not null default '{}';  -- VC, MKB, Mid-cap, Large-cap
alter table public.parties add column if not exists markets text[] not null default '{}';  -- vrije markten, bijv. Zorg, Tandartsen
