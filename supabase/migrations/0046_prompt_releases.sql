-- Prompts as immutable releases. Today ai_tone/ai_instructions on
-- businesses are plain mutable text, read live on every chat message by
-- lib/ai/buildContext.ts -- any edit changes the live bot instantly, with
-- no diff, no history, no rollback path. This introduces a versioned
-- release table as the system of record for prompt *history*, while
-- businesses.ai_tone/ai_instructions stay exactly as they are today: a
-- denormalized mirror of whichever release is currently active, updated
-- only at publish/rollback time. lib/ai/buildContext.ts's hot read path
-- (and its existing 60s in-memory cache) is completely unchanged by this
-- migration -- it never queries prompt_releases.

create table if not exists prompt_releases (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  version integer not null,
  ai_tone text,
  ai_instructions text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  note text,
  created_by text not null,
  created_at timestamptz not null default now(),
  published_by text,
  published_at timestamptz,
  unique (business_id, version)
);

-- At most one draft in flight per business -- editing a draft is an
-- upsert-in-place (see upsert_prompt_draft below), never a proliferation
-- of draft rows.
create unique index if not exists idx_prompt_releases_one_draft_per_business
  on prompt_releases (business_id)
  where status = 'draft';

create index if not exists idx_prompt_releases_business_version
  on prompt_releases (business_id, version desc);

alter table businesses
  add column if not exists active_prompt_release_id uuid references prompt_releases(id);

-- "Immutable" isn't just a naming convention: once a release has been
-- published, its content and version are locked. Further edits happen by
-- creating a new draft (the next version), never by mutating history.
-- This still allows the one UPDATE that legitimately touches a published
-- row's content: the draft -> published transition itself, where
-- OLD.status is 'draft' at the moment the trigger fires, not 'published'.
create or replace function prevent_published_release_mutation()
returns trigger as $$
begin
  if old.status = 'published' and (
    new.ai_tone is distinct from old.ai_tone
    or new.ai_instructions is distinct from old.ai_instructions
    or new.version is distinct from old.version
    or new.business_id is distinct from old.business_id
  ) then
    raise exception 'prompt_releases: cannot modify a published release (id=%)', old.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_prevent_published_release_mutation on prompt_releases;
create trigger trg_prevent_published_release_mutation
  before update on prompt_releases
  for each row
  execute function prevent_published_release_mutation();

-- Atomically updates the business's single in-flight draft, or creates
-- one (at the next version number) if none exists. Wrapped in a function
-- rather than done as a read-then-write from application code so two
-- concurrent "save draft" calls for the same business can't race past
-- each other into two different version numbers.
create or replace function upsert_prompt_draft(
  p_business_id uuid,
  p_ai_tone text,
  p_ai_instructions text,
  p_note text,
  p_actor_email text
)
returns prompt_releases as $$
declare
  v_release prompt_releases;
  v_next_version integer;
begin
  update prompt_releases
  set ai_tone = p_ai_tone,
      ai_instructions = p_ai_instructions,
      note = p_note
  where business_id = p_business_id
    and status = 'draft'
  returning * into v_release;

  if found then
    return v_release;
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
  from prompt_releases
  where business_id = p_business_id;

  insert into prompt_releases (
    business_id, version, ai_tone, ai_instructions, status, note, created_by
  ) values (
    p_business_id, v_next_version, p_ai_tone, p_ai_instructions, 'draft', p_note, p_actor_email
  )
  returning * into v_release;

  return v_release;
end;
$$ language plpgsql;

-- The single action behind both "Publish" and "Roll back to this
-- version" -- both are, at bottom, "make this release the active one for
-- this business." If the target is still a draft, this also flips it to
-- published and stamps published_by/published_at (first-time publish).
-- If it's already published (a rollback, or re-promoting an older
-- version), it's simply repointed without touching its original
-- published_at/published_by -- rolling back to v3 shouldn't rewrite v3's
-- real publish history.
create or replace function publish_prompt_release(
  p_business_id uuid,
  p_release_id uuid,
  p_actor_email text
)
returns prompt_releases as $$
declare
  v_release prompt_releases;
begin
  select * into v_release
  from prompt_releases
  where id = p_release_id and business_id = p_business_id
  for update;

  if not found then
    raise exception 'publish_prompt_release: release % not found for business %', p_release_id, p_business_id;
  end if;

  if v_release.status = 'draft' then
    update prompt_releases
    set status = 'published',
        published_by = p_actor_email,
        published_at = now()
    where id = v_release.id
    returning * into v_release;
  end if;

  update businesses
  set active_prompt_release_id = v_release.id,
      ai_tone = v_release.ai_tone,
      ai_instructions = v_release.ai_instructions
  where id = p_business_id;

  return v_release;
end;
$$ language plpgsql;

-- Backfill: every existing business gets its current ai_tone/
-- ai_instructions captured as version 1, published, and pointed to --
-- zero behavior change (businesses.ai_tone/ai_instructions don't even
-- change value, they just gain a version-1 history entry behind them).
insert into prompt_releases (business_id, version, ai_tone, ai_instructions, status, created_by, published_by, published_at)
select id, 1, ai_tone, ai_instructions, 'published', 'system-backfill', 'system-backfill', now()
from businesses
where active_prompt_release_id is null
on conflict (business_id, version) do nothing;

update businesses
set active_prompt_release_id = prompt_releases.id
from prompt_releases
where prompt_releases.business_id = businesses.id
  and prompt_releases.version = 1
  and businesses.active_prompt_release_id is null;
