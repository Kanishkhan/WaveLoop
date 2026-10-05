-- WaveLoop schema + RPC functions.
-- Run once in the Supabase SQL editor (Project → SQL → New query → paste → Run).
-- Safe to re-run: tables use IF NOT EXISTS, functions use CREATE OR REPLACE.
--
-- Rules encoded here:
--   * Qualified = graduation_year 2027 (a generated column, so it cannot be set by hand).
--   * Leaderboards and reward progress count qualified referrals only.
--   * Every simulated row carries is_simulated = true and can be wiped by wl_sim_reset().
-- The API calls these functions through Supabase's REST endpoint (/rest/v1/rpc/<name>)
-- using the service-role key; anon/authenticated roles get no access.

-- ───────────────────────────── Tables ─────────────────────────────

create table if not exists public.ambassadors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 2 and 80),
  email        text not null check (char_length(email) between 5 and 254),
  college      text not null check (char_length(college) between 2 and 120),
  code         text not null unique,
  is_simulated boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.registrations (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 2 and 80),
  email             text not null check (char_length(email) between 5 and 254),
  college           text not null check (char_length(college) between 2 and 120),
  branch            text not null check (branch in ('CSE', 'IT', 'ECE', 'Other')),
  graduation_year   integer check (graduation_year between 2020 and 2035),
  goal              text check (char_length(goal) <= 80),
  channel           text not null check (channel in ('ambassador', 'referral', 'community', 'social', 'direct')),
  referral_source   text check (char_length(referral_source) <= 60),
  referred_by_code  text,
  own_referral_code text not null unique,
  is_qualified      boolean generated always as (coalesce(graduation_year = 2027, false)) stored,
  is_simulated      boolean not null default false,
  created_at        timestamptz not null default now()
);

create table if not exists public.referral_events (
  id              bigint generated always as identity primary key,
  referrer_code   text not null,
  referrer_type   text not null check (referrer_type in ('ambassador', 'student')),
  registration_id uuid not null unique references public.registrations (id) on delete cascade,
  is_qualified    boolean not null,
  is_simulated    boolean not null default false,
  created_at      timestamptz not null default now()
);

create table if not exists public.simulation_runs (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'completed' check (status in ('completed', 'reset')),
  seed         integer,
  window_start date,
  window_end   date,
  params       jsonb not null default '{}'::jsonb,
  totals       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  reset_at     timestamptz
);

-- ───────────────────────────── Indexes ─────────────────────────────

create unique index if not exists ambassadors_email_uidx        on public.ambassadors (lower(email));
create index        if not exists ambassadors_sim_idx           on public.ambassadors (is_simulated);
create unique index if not exists registrations_email_uidx      on public.registrations (lower(email));
create index        if not exists registrations_created_idx     on public.registrations (created_at desc);
create index        if not exists registrations_referred_by_idx on public.registrations (referred_by_code, is_qualified) where referred_by_code is not null;
create index        if not exists registrations_channel_idx     on public.registrations (channel, is_qualified);
create index        if not exists registrations_sim_idx         on public.registrations (is_simulated, created_at);
create index        if not exists referral_events_referrer_idx  on public.referral_events (referrer_code, is_qualified);
create index        if not exists referral_events_created_idx   on public.referral_events (created_at desc);
create index        if not exists simulation_runs_created_idx   on public.simulation_runs (created_at desc);

-- RLS on with no policies: only the service role (used by /api) can read or write.
alter table public.ambassadors     enable row level security;
alter table public.registrations   enable row level security;
alter table public.referral_events enable row level security;
alter table public.simulation_runs enable row level security;

-- ───────────────────────────── Helpers ─────────────────────────────

create or replace function public.wl_in_scope(p_is_sim boolean, p_scope text)
returns boolean language sql immutable as $$
  select case coalesce(p_scope, 'all')
    when 'real' then not p_is_sim
    when 'sim'  then p_is_sim
    else true
  end
$$;

create or replace function public.wl_make_code(p_name text)
returns text language sql volatile as $$
  select coalesce(nullif(upper(left(regexp_replace(coalesce(p_name, ''), '[^A-Za-z0-9]', '', 'g'), 5)), ''), 'WAVE')
         || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 5))
$$;

create or replace function public.wl_first_name(p_name text)
returns text language sql immutable as $$
  select split_part(trim(p_name), ' ', 1)
$$;

create or replace function public.wl_progress_for(p_code text)
returns jsonb language sql stable as $$
  with c as (
    select count(*) filter (where is_qualified)     as verified,
           count(*) filter (where not is_qualified) as pending,
           count(*)                                 as total
    from public.registrations
    where referred_by_code = p_code
  )
  select jsonb_build_object(
    'code', p_code,
    'verified', c.verified,
    'not_qualified', c.pending,
    'total', c.total,
    'goal', 5,
    'milestones', jsonb_build_array(
      jsonb_build_object('at', 1, 'unlocked', c.verified >= 1),
      jsonb_build_object('at', 3, 'unlocked', c.verified >= 3),
      jsonb_build_object('at', 5, 'unlocked', c.verified >= 5)),
    'next_milestone', case when c.verified < 1 then 1 when c.verified < 3 then 3 when c.verified < 5 then 5 else null end)
  from c
$$;

create or replace function public.wl_public_registration(r public.registrations)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'first_name', public.wl_first_name(r.name),
    'college', r.college,
    'branch', r.branch,
    'graduation_year', r.graduation_year,
    'is_qualified', r.is_qualified,
    'channel', r.channel,
    'own_referral_code', r.own_referral_code,
    'referred_by_code', r.referred_by_code,
    'is_simulated', r.is_simulated,
    'created_at', r.created_at)
$$;

-- ───────────────────────────── Registration ─────────────────────────────

-- p: {name, email, college, branch, graduation_year, goal, channel, referral_source, referred_by_code}
-- `channel` is the attribution derived from source/UTM; a valid referral code overrides it.
create or replace function public.wl_register(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_email    text := lower(trim(p->>'email'));
  v_ref      text := nullif(upper(trim(coalesce(p->>'referred_by_code', ''))), '');
  v_ref_type text;
  v_status   text := 'none';
  v_channel  text := coalesce(p->>'channel', 'direct');
  v_row      public.registrations;
  v_attempt  int := 0;
begin
  select * into v_row from public.registrations where lower(email) = v_email;
  if found then
    return jsonb_build_object('ok', true, 'existing', true,
      'registration', public.wl_public_registration(v_row),
      'referral', jsonb_build_object('status', 'already_registered'),
      'progress', public.wl_progress_for(v_row.own_referral_code));
  end if;

  if v_ref is not null then
    if exists (select 1 from public.ambassadors where code = v_ref and lower(email) = v_email) then
      v_status := 'self_referral'; v_ref := null;
    elsif exists (select 1 from public.ambassadors where code = v_ref) then
      v_ref_type := 'ambassador'; v_channel := 'ambassador'; v_status := 'credited';
    elsif exists (select 1 from public.registrations where own_referral_code = v_ref) then
      v_ref_type := 'student'; v_channel := 'referral'; v_status := 'credited';
    else
      v_status := 'unknown_code'; v_ref := null;
    end if;
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.registrations
        (name, email, college, branch, graduation_year, goal, channel, referral_source, referred_by_code, own_referral_code)
      values
        (trim(p->>'name'), v_email, trim(p->>'college'), p->>'branch', (p->>'graduation_year')::int,
         nullif(p->>'goal', ''), v_channel, nullif(p->>'referral_source', ''), v_ref, public.wl_make_code(p->>'name'))
      returning * into v_row;
      exit;
    exception when unique_violation then
      -- Either a concurrent sign-up with the same email, or a referral-code collision (retry).
      select * into v_row from public.registrations where lower(email) = v_email;
      if found then
        return jsonb_build_object('ok', true, 'existing', true,
          'registration', public.wl_public_registration(v_row),
          'referral', jsonb_build_object('status', 'already_registered'),
          'progress', public.wl_progress_for(v_row.own_referral_code));
      end if;
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;

  if v_ref_type is not null then
    insert into public.referral_events (referrer_code, referrer_type, registration_id, is_qualified)
    values (v_ref, v_ref_type, v_row.id, v_row.is_qualified);
  end if;

  return jsonb_build_object('ok', true, 'existing', false,
    'registration', public.wl_public_registration(v_row),
    'referral', jsonb_build_object(
      'status', v_status,
      'code', v_ref,
      'referrer_type', v_ref_type,
      'counts_toward_rewards', v_ref_type is not null and v_row.is_qualified),
    'progress', public.wl_progress_for(v_row.own_referral_code));
end
$$;

-- p: {code}
create or replace function public.wl_get_registration(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_row public.registrations;
begin
  select * into v_row from public.registrations where own_referral_code = upper(trim(p->>'code'));
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'registration', public.wl_public_registration(v_row),
                            'progress', public.wl_progress_for(v_row.own_referral_code));
end
$$;

-- p: {code} — works for a student code or an ambassador code.
create or replace function public.wl_referral_progress(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_code text := upper(trim(p->>'code'));
  v_name text;
  v_type text;
  v_sim  boolean;
begin
  select name, 'student', is_simulated into v_name, v_type, v_sim from public.registrations where own_referral_code = v_code;
  if not found then
    select name, 'ambassador', is_simulated into v_name, v_type, v_sim from public.ambassadors where code = v_code;
  end if;
  if v_type is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'type', v_type, 'owner_first_name', public.wl_first_name(v_name),
                            'is_simulated', v_sim, 'progress', public.wl_progress_for(v_code));
end
$$;

-- ───────────────────────────── Ambassadors ─────────────────────────────

-- p: {name, email, college}
create or replace function public.wl_ambassador_signup(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_email   text := lower(trim(p->>'email'));
  v_row      public.ambassadors;
  v_attempt  int := 0;
  v_existing boolean := false;
begin
  select * into v_row from public.ambassadors where lower(email) = v_email;
  if found then
    return jsonb_build_object('ok', true, 'existing', true,
      'ambassador', jsonb_build_object('first_name', public.wl_first_name(v_row.name), 'college', v_row.college, 'code', v_row.code));
  end if;
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.ambassadors (name, email, college, code)
      values (trim(p->>'name'), v_email, trim(p->>'college'), 'AMB-' || public.wl_make_code(p->>'name'))
      returning * into v_row;
      exit;
    exception when unique_violation then
      select * into v_row from public.ambassadors where lower(email) = v_email;
      if found then v_existing := true; exit; end if;
      if v_attempt >= 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'existing', v_existing,
    'ambassador', jsonb_build_object('first_name', public.wl_first_name(v_row.name), 'college', v_row.college, 'code', v_row.code));
end
$$;

-- Ranked ambassadors. Only qualified (2027) sign-ups count as "verified".
create or replace function public.wl_ambassador_ranking(p_scope text)
returns table (code text, name text, college text, is_simulated boolean, created_at timestamptz,
               verified bigint, not_qualified bigint, last_signup_at timestamptz, rank bigint)
language sql stable as $$
  select a.code, a.name, a.college, a.is_simulated, a.created_at,
         count(r.id) filter (where r.is_qualified)     as verified,
         count(r.id) filter (where not r.is_qualified) as not_qualified,
         max(r.created_at) filter (where r.is_qualified) as last_signup_at,
         rank() over (order by count(r.id) filter (where r.is_qualified) desc) as rank
  from public.ambassadors a
  left join public.registrations r on r.referred_by_code = a.code
  where public.wl_in_scope(a.is_simulated, p_scope)
  group by a.id
$$;

-- p: {limit, scope}
create or replace function public.wl_leaderboard(p jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'counted', 'verified final-year (2027) sign-ups only',
    'includes_simulated', coalesce(bool_or(x.is_simulated), false),
    'updated_at', now(),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
        'rank', x.rank, 'code', x.code, 'name', x.name, 'college', x.college,
        'verified', x.verified, 'is_simulated', x.is_simulated) order by x.verified desc, x.last_signup_at asc nulls last, x.created_at asc), '[]'::jsonb))
  from (
    select * from public.wl_ambassador_ranking(coalesce(p->>'scope', 'all'))
    order by verified desc, last_signup_at asc nulls last, created_at asc
    limit greatest(1, least(coalesce((p->>'limit')::int, 10), 50))
  ) x
$$;

-- p: {code}
create or replace function public.wl_ambassador_stats(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  v_code text := upper(trim(p->>'code'));
  v_row  record;
begin
  select * into v_row from public.wl_ambassador_ranking('all') where code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'ambassador', jsonb_build_object(
    'first_name', public.wl_first_name(v_row.name), 'college', v_row.college, 'code', v_row.code,
    'verified', v_row.verified, 'not_qualified', v_row.not_qualified, 'rank', v_row.rank,
    'is_simulated', v_row.is_simulated, 'last_signup_at', v_row.last_signup_at),
    'progress', public.wl_progress_for(v_row.code));
end
$$;

-- p: {scope} — admin only (includes emails).
create or replace function public.wl_ambassadors_list(p jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'rows', coalesce(jsonb_agg(jsonb_build_object(
      'rank', x.rank, 'code', x.code, 'name', x.name, 'email', a.email, 'college', x.college,
      'verified', x.verified, 'not_qualified', x.not_qualified, 'last_signup_at', x.last_signup_at,
      'is_simulated', x.is_simulated, 'created_at', x.created_at)
      order by x.verified desc, x.created_at asc), '[]'::jsonb))
  from public.wl_ambassador_ranking(coalesce(p->>'scope', 'all')) x
  join public.ambassadors a on a.code = x.code
$$;

-- ───────────────────────────── Analytics ─────────────────────────────

-- p: {scope}
create or replace function public.wl_stats(p jsonb)
returns jsonb language sql stable as $$
  with r as (select * from public.registrations where public.wl_in_scope(is_simulated, coalesce(p->>'scope', 'all'))),
       e as (select * from public.referral_events where public.wl_in_scope(is_simulated, coalesce(p->>'scope', 'all')))
  select jsonb_build_object(
    'ok', true,
    'scope', coalesce(p->>'scope', 'all'),
    'total', (select count(*) from r),
    'qualified', (select count(*) from r where is_qualified),
    'not_qualified', (select count(*) from r where not is_qualified),
    'target', 500,
    'referral_events', (select count(*) from e),
    'verified_referrals', (select count(*) from e where is_qualified),
    'ambassadors', (select count(*) from public.ambassadors a where public.wl_in_scope(a.is_simulated, coalesce(p->>'scope', 'all'))),
    'last_signup_at', (select max(created_at) from r),
    'includes_simulated', exists (select 1 from r where is_simulated),
    'simulated_rows', (select count(*) from public.registrations where is_simulated),
    'real_rows', (select count(*) from public.registrations where not is_simulated))
$$;

-- p: {scope}
create or replace function public.wl_channel_breakdown(p jsonb)
returns jsonb language sql stable as $$
  with ch(channel, label, ord) as (values
         ('ambassador', 'Campus ambassadors', 1), ('referral', 'Referral loop', 2),
         ('community', 'Placement communities', 3), ('social', 'Social / creator', 4), ('direct', 'Direct', 5)),
       r as (select * from public.registrations where public.wl_in_scope(is_simulated, coalesce(p->>'scope', 'all'))),
       agg as (
         select ch.channel, ch.label, ch.ord,
                count(r.id) as total, count(r.id) filter (where r.is_qualified) as qualified
         from ch left join r on r.channel = ch.channel
         group by ch.channel, ch.label, ch.ord)
  select jsonb_build_object(
    'ok', true,
    'includes_simulated', exists (select 1 from r where is_simulated),
    'total', (select coalesce(sum(total), 0) from agg),
    'qualified', (select coalesce(sum(qualified), 0) from agg),
    'channels', jsonb_agg(jsonb_build_object(
        'channel', channel, 'label', label, 'total', total, 'qualified', qualified,
        'qualified_share', case when (select sum(qualified) from agg) > 0
                                then round(qualified::numeric / (select sum(qualified) from agg), 4) else 0 end)
        order by ord))
  from agg
$$;

-- p: {scope}. Days are India Standard Time calendar days; gaps are filled with zeros.
create or replace function public.wl_daily_series(p jsonb)
returns jsonb language sql stable as $$
  with r as (
         select (created_at at time zone 'Asia/Kolkata')::date as day, is_qualified, is_simulated
         from public.registrations where public.wl_in_scope(is_simulated, coalesce(p->>'scope', 'all'))),
       bounds as (select min(day) as d0, max(day) as d1 from r),
       days as (select generate_series(d0, d1, interval '1 day')::date as day from bounds where d0 is not null),
       daily as (
         select d.day, count(r.day) as total, count(r.day) filter (where r.is_qualified) as qualified
         from days d left join r on r.day = d.day group by d.day),
       cum as (
         select day, total, qualified,
                sum(total) over (order by day) as cum_total,
                sum(qualified) over (order by day) as cum_qualified
         from daily)
  select jsonb_build_object(
    'ok', true,
    'timezone', 'Asia/Kolkata',
    'includes_simulated', exists (select 1 from r where is_simulated),
    'days', coalesce((select jsonb_agg(jsonb_build_object(
        'day', day, 'total', total, 'qualified', qualified,
        'cum_total', cum_total, 'cum_qualified', cum_qualified) order by day) from cum), '[]'::jsonb))
$$;

-- p: {scope, recent_limit}. One call powers the whole command center.
create or replace function public.wl_admin_overview(p jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'ok', true,
    'scope', coalesce(p->>'scope', 'all'),
    'generated_at', now(),
    'stats', public.wl_stats(p) - 'ok',
    'channels', public.wl_channel_breakdown(p) - 'ok',
    'daily', public.wl_daily_series(p) - 'ok',
    'ambassadors', (public.wl_ambassadors_list(p))->'rows',
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
          'name', x.name, 'email', regexp_replace(x.email, '^(.).*(@.*)$', '\1***\2'),
          'college', x.college, 'branch', x.branch, 'graduation_year', x.graduation_year,
          'goal', x.goal, 'channel', x.channel, 'referral_source', x.referral_source,
          'referred_by_code', x.referred_by_code, 'own_referral_code', x.own_referral_code,
          'is_qualified', x.is_qualified, 'is_simulated', x.is_simulated, 'created_at', x.created_at)
          order by x.created_at desc)
      from (select * from public.registrations
            where public.wl_in_scope(is_simulated, coalesce(p->>'scope', 'all'))
            order by created_at desc
            limit greatest(1, least(coalesce((p->>'recent_limit')::int, 25), 200))) x), '[]'::jsonb),
    'simulation', (select to_jsonb(s) from public.simulation_runs s order by created_at desc limit 1))
$$;

-- ───────────────────────────── Simulation ─────────────────────────────

create or replace function public.wl_sim_totals()
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'total', (select count(*) from public.registrations where is_simulated),
    'qualified', (select count(*) from public.registrations where is_simulated and is_qualified),
    'ambassadors', (select count(*) from public.ambassadors where is_simulated),
    'referral_events', (select count(*) from public.referral_events where is_simulated),
    'qualified_by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.registrations
        where is_simulated and is_qualified group by channel) c),
    'total_by_channel', (select coalesce(jsonb_object_agg(channel, n), '{}'::jsonb) from (
        select channel, count(*) as n from public.registrations
        where is_simulated group by channel) c),
    'first_signup_at', (select min(created_at) from public.registrations where is_simulated),
    'last_signup_at', (select max(created_at) from public.registrations where is_simulated),
    'max_signups_in_one_minute', (select coalesce(max(n), 0) from (
        select count(*) as n from public.registrations where is_simulated
        group by date_trunc('minute', created_at)) m))
$$;

create or replace function public.wl_sim_reset(p jsonb default '{}'::jsonb)
returns jsonb language plpgsql as $$
declare
  v_regs int;
  v_ambs int;
begin
  delete from public.referral_events where is_simulated;
  delete from public.registrations where is_simulated;
  get diagnostics v_regs = row_count;
  delete from public.ambassadors where is_simulated;
  get diagnostics v_ambs = row_count;
  update public.simulation_runs set status = 'reset', reset_at = now() where status = 'completed';
  return jsonb_build_object('ok', true, 'deleted_registrations', v_regs, 'deleted_ambassadors', v_ambs);
end
$$;

-- p: {seed, window_start, window_end, params, ambassadors: [...], registrations: [...]}
-- Rows are generated by api/_lib/simulate.js; this function replaces any previous simulated data.
create or replace function public.wl_sim_seed(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_totals jsonb;
  v_run    public.simulation_runs;
begin
  perform public.wl_sim_reset('{}'::jsonb);

  insert into public.ambassadors (name, email, college, code, is_simulated, created_at)
  select x.name, x.email, x.college, x.code, true, x.created_at
  from jsonb_to_recordset(p->'ambassadors')
       as x(name text, email text, college text, code text, created_at timestamptz);

  insert into public.registrations
    (name, email, college, branch, graduation_year, goal, channel, referral_source,
     referred_by_code, own_referral_code, is_simulated, created_at)
  select x.name, x.email, x.college, x.branch, x.graduation_year, x.goal, x.channel, x.referral_source,
         x.referred_by_code, x.own_referral_code, true, x.created_at
  from jsonb_to_recordset(p->'registrations')
       as x(name text, email text, college text, branch text, graduation_year int, goal text, channel text,
            referral_source text, referred_by_code text, own_referral_code text, created_at timestamptz)
  order by x.created_at;

  insert into public.referral_events (referrer_code, referrer_type, registration_id, is_qualified, is_simulated, created_at)
  select r.referred_by_code,
         case when exists (select 1 from public.ambassadors a where a.code = r.referred_by_code) then 'ambassador' else 'student' end,
         r.id, r.is_qualified, true, r.created_at
  from public.registrations r
  where r.is_simulated and r.referred_by_code is not null;

  v_totals := public.wl_sim_totals();
  insert into public.simulation_runs (status, seed, window_start, window_end, params, totals)
  values ('completed', (p->>'seed')::int, (p->>'window_start')::date, (p->>'window_end')::date,
          coalesce(p->'params', '{}'::jsonb), v_totals)
  returning * into v_run;

  return jsonb_build_object('ok', true, 'run', to_jsonb(v_run), 'totals', v_totals);
end
$$;

create or replace function public.wl_sim_status(p jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'totals', public.wl_sim_totals(),
    'run', (select to_jsonb(s) from public.simulation_runs s order by created_at desc limit 1))
$$;

create or replace function public.wl_health(p jsonb default '{}'::jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object('ok', true, 'db', 'ok', 'time', now())
$$;

-- ───────────────────────────── Permissions ─────────────────────────────
-- Supabase exposes public functions over REST and grants EXECUTE to anon by default.
-- Lock every wl_* function to the service role used by the serverless API.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'wl\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke all on function %s from anon', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke all on function %s from authenticated', f.sig);
    end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end
$$;

-- Ask PostgREST to pick up the new functions immediately.
notify pgrst, 'reload schema';
