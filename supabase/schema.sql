-- Life: database schema for Supabase.
-- Paste this whole file into Supabase → SQL Editor → Run. Safe to run once on a fresh project.
--
-- Security model: every module row carries a household_id, and row level security only lets
-- members of that household read or write it. Household membership itself can only be
-- created through the create_household / accept_invite functions below.

-- ───────────────────────────── Core ─────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  language text not null default 'en' check (language in ('en', 'de')),
  color text not null default '#4f7cff',
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  email text not null check (email like '%@%'),
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Security definer so policies can call it without recursing into household_members' own policy.
create function public.is_member(hid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = (select auth.uid())
  );
$$;

create function public.shares_household(other uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = (select auth.uid()) and b.user_id = other
  );
$$;

-- A profile is created automatically for every new account.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, language)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data ->> 'language' = 'de' then 'de' else 'en' end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.create_household(household_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.households (name, created_by) values (household_name, auth.uid()) returning id into hid;
  insert into public.household_members (household_id, user_id) values (hid, auth.uid());
  return hid;
end;
$$;

-- Invites addressed to the signed-in user's email address.
create function public.my_invites()
returns table (id uuid, household_id uuid, household_name text, invited_by_name text)
language sql stable security definer set search_path = '' as $$
  select i.id, i.household_id, h.name, p.display_name
  from public.household_invites i
  join public.households h on h.id = i.household_id
  left join public.profiles p on p.id = i.invited_by
  where i.accepted_at is null
    and lower(i.email) = lower(auth.jwt() ->> 'email');
$$;

create function public.accept_invite(invite_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  update public.household_invites
     set accepted_at = now()
   where id = invite_id
     and accepted_at is null
     and lower(email) = lower(auth.jwt() ->> 'email')
  returning household_id into hid;

  if hid is null then
    raise exception 'invite not found';
  end if;

  insert into public.household_members (household_id, user_id)
  values (hid, auth.uid())
  on conflict do nothing;
  return hid;
end;
$$;

-- ───────────────────────────── Shopping lists ─────────────────────────────
-- Ids are generated on the phone so changes made offline can be queued and replayed safely.

create table public.lists (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, household_id)
);

create table public.list_items (
  id uuid primary key,
  household_id uuid not null,
  list_id uuid not null,
  name text not null,
  quantity text,
  checked boolean not null default false,
  checked_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- The composite key guarantees an item can only belong to a list of the same household.
  foreign key (list_id, household_id) references public.lists (id, household_id) on delete cascade
);
create index list_items_household_idx on public.list_items (household_id, created_at desc);

-- ───────────────────────────── To-dos ─────────────────────────────

create table public.todos (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  title text not null,
  notes text,
  due_date date,
  -- null means "both of us"
  assignee uuid references public.profiles (id) on delete set null,
  repeat_unit text check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_every integer not null default 1 check (repeat_every between 1 and 365),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index todos_household_idx on public.todos (household_id);

-- ───────────────────────────── Access rules ─────────────────────────────

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.lists enable row level security;
alter table public.list_items enable row level security;
alter table public.todos enable row level security;

create policy "see own and housemates' profiles" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.shares_household(id));
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members see household" on public.households
  for select to authenticated using (public.is_member(id));
create policy "members rename household" on public.households
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

create policy "members see members" on public.household_members
  for select to authenticated using (public.is_member(household_id));
create policy "leave household" on public.household_members
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "members manage invites" on public.household_invites
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

create policy "household data" on public.lists
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household data" on public.list_items
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy "household data" on public.todos
  for all to authenticated
  using (public.is_member(household_id)) with check (public.is_member(household_id));

-- Explicit grants, so the API works regardless of the project's default exposure settings.
revoke all on all tables in schema public from anon;
grant select, update on public.profiles to authenticated;
grant select, update on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_invites, public.lists, public.list_items, public.todos to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_member(uuid), public.shares_household(uuid), public.create_household(text),
  public.my_invites(), public.accept_invite(uuid) to authenticated;

-- Live sync between phones.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.lists, public.list_items, public.todos;
  end if;
end;
$$;
