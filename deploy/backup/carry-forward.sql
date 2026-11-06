create or replace function pg_temp.facts_to_carry_forward() returns table (carried_kind text, carried_fact jsonb)
language plpgsql set search_path = pg_catalog as $$
declare
  read_now bigint;
  facts bigint := 0;
  issued_receipts bigint := 0;
begin
  if to_regclass('public.donor') is not null then
    return query
      select 'donor', (select jsonb_object_agg(field.key, field.value) from jsonb_each(to_jsonb(d)) field
                       where field.key in ('id', 'erased_at', 'password_hash'))
      from public.donor d;
    get diagnostics read_now = row_count;
    facts := facts + read_now;
  end if;
  if to_regclass('public.donor_role') is not null then
    return query select 'role', to_jsonb(r) from public.donor_role r;
    get diagnostics read_now = row_count;
    facts := facts + read_now;
  end if;
  if to_regclass('public.donor_passkey') is not null then
    return query select 'passkey', to_jsonb(p) from public.donor_passkey p;
    get diagnostics read_now = row_count;
    facts := facts + read_now;
  end if;
  if to_regclass('public.donor_second_factor') is not null then
    return query select 'second_factor', to_jsonb(s) from public.donor_second_factor s;
    get diagnostics read_now = row_count;
    facts := facts + read_now;
  end if;
  if to_regclass('public.admin_action') is not null then
    return query select 'admin_action', to_jsonb(a) from public.admin_action a;
    get diagnostics read_now = row_count;
    facts := facts + read_now;
  end if;
  if to_regclass('public.issued_receipt') is not null then
    select count(*) into issued_receipts from public.issued_receipt;
  end if;
  return query select 'issued_receipts', jsonb_build_object('count', issued_receipts);
  return query select 'end', jsonb_build_object('facts', facts + 1);
end
$$;

create or replace function pg_temp.insert_carried(target text, fact_kind text, condition text, owners uuid[]) returns bigint
language plpgsql set search_path = pg_catalog as $$
declare
  target_columns text;
  carried_columns text;
  inserted bigint;
begin
  if not exists (select 1 from pg_temp.carried k where k.kind = fact_kind) then
    return 0;
  end if;
  if to_regclass('public.' || quote_ident(target)) is null then
    raise exception 'the backup has no table % for what changed since it was taken', target;
  end if;
  select string_agg(quote_ident(c.column_name), ', ' order by c.ordinal_position),
         string_agg('r.' || quote_ident(c.column_name), ', ' order by c.ordinal_position)
    into target_columns, carried_columns
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = target and c.is_generated = 'NEVER'
    and exists (select 1 from pg_temp.carried k where k.kind = fact_kind and k.fact ? c.column_name);
  execute format('insert into public.%I (%s) select %s from pg_temp.carried k cross join lateral jsonb_populate_record(null::public.%I, k.fact) r'
                 ' where k.kind = %L and (%s)', target, target_columns, carried_columns, target, fact_kind, condition)
    using owners;
  get diagnostics inserted = row_count;
  return inserted;
end
$$;

create or replace function pg_temp.carry_forward() returns text
language plpgsql set search_path = pg_catalog as $$
declare
  receipt_number_margin constant bigint := 1000;
  ends bigint;
  announced bigint;
  arrived bigint;
  shared_donors uuid[];
  newly_erased uuid[];
  roles_changed uuid[];
  passwords_changed uuid[];
  passkeys_changed uuid[] := '{}';
  second_factors_changed uuid[] := '{}';
  erasures bigint;
  credentials bigint;
  roles bigint;
  admin_actions bigint := 0;
  receipt_numbers_skipped bigint := 0;
begin
  select count(*), max((k.fact ->> 'facts')::bigint) into ends, announced from pg_temp.carried k where k.kind = 'end';
  select count(*) into arrived from pg_temp.carried k where k.kind <> 'end';
  if ends <> 1 or announced is distinct from arrived then
    raise exception 'the facts read from the database before the restore arrived incomplete';
  end if;

  select coalesce(array_agg(d.id order by d.id), '{}') into shared_donors
  from public.donor d where exists (select 1 from pg_temp.carried k where k.kind = 'donor' and (k.fact ->> 'id')::uuid = d.id);

  select coalesce(array_agg(d.id order by d.id), '{}') into newly_erased
  from public.donor d join pg_temp.carried k on k.kind = 'donor' and (k.fact ->> 'id')::uuid = d.id
  where k.fact ->> 'erased_at' is not null and d.erased_at is null;

  select coalesce(array_agg(shared.id order by shared.id), '{}') into roles_changed
  from unnest(shared_donors) shared (id)
  where array(select k.fact ->> 'role' from pg_temp.carried k where k.kind = 'role' and (k.fact ->> 'donor_id')::uuid = shared.id order by 1)
        is distinct from array(select r.role::text from public.donor_role r where r.donor_id = shared.id order by 1);
  delete from public.donor_role r where r.donor_id = any(roles_changed);
  insert into public.donor_role (donor_id, role)
    select (k.fact ->> 'donor_id')::uuid, k.fact ->> 'role' from pg_temp.carried k
    where k.kind = 'role' and (k.fact ->> 'donor_id')::uuid = any(roles_changed);

  with changed as (
    update public.donor d set password_hash = k.fact ->> 'password_hash'
    from pg_temp.carried k
    where k.kind = 'donor' and (k.fact ->> 'id')::uuid = d.id and k.fact ? 'password_hash'
      and d.password_hash is distinct from k.fact ->> 'password_hash'
    returning d.id)
  select coalesce(array_agg(changed.id), '{}') into passwords_changed from changed;

  if to_regclass('public.donor_passkey') is not null then
    select coalesce(array_agg(shared.id order by shared.id), '{}') into passkeys_changed
    from unnest(shared_donors) shared (id)
    where array(select (k.fact ->> 'id')::uuid from pg_temp.carried k where k.kind = 'passkey' and (k.fact ->> 'donor_id')::uuid = shared.id order by 1)
          is distinct from array(select p.id from public.donor_passkey p where p.donor_id = shared.id order by 1);
    delete from public.donor_passkey p where p.donor_id = any(passkeys_changed);
  end if;
  perform pg_temp.insert_carried('donor_passkey', 'passkey', '(k.fact ->> ''donor_id'')::uuid = any($1)', passkeys_changed);

  if to_regclass('public.donor_second_factor') is not null then
    select coalesce(array_agg(shared.id order by shared.id), '{}') into second_factors_changed
    from unnest(shared_donors) shared (id)
    left join pg_temp.carried k on k.kind = 'second_factor' and (k.fact ->> 'donor_id')::uuid = shared.id
    left join public.donor_second_factor s on s.donor_id = shared.id
    where (k.fact ->> 'secret', (k.fact ->> 'confirmed_at')::timestamptz) is distinct from (s.secret::text, s.confirmed_at);
    delete from public.donor_second_factor s where s.donor_id = any(second_factors_changed);
  end if;
  perform pg_temp.insert_carried('donor_second_factor', 'second_factor', '(k.fact ->> ''donor_id'')::uuid = any($1)', second_factors_changed);

  admin_actions := pg_temp.insert_carried('admin_action', 'admin_action',
      'not exists (select 1 from public.admin_action a where a.id = (k.fact ->> ''id'')::uuid)', null);

  update public.donor d set erased_at = (k.fact ->> 'erased_at')::timestamptz
  from pg_temp.carried k
  where k.kind = 'donor' and (k.fact ->> 'id')::uuid = d.id and d.id = any(newly_erased);
  get diagnostics erasures = row_count;

  select count(*) into credentials from (
    select unnest(passwords_changed) union select unnest(passkeys_changed) union select unnest(second_factors_changed)) changed (id)
  where changed.id <> all(newly_erased);
  select count(*) into roles from unnest(roles_changed) changed (id) where changed.id <> all(newly_erased);

  if exists (select 1 from pg_temp.carried k where k.kind = 'issued_receipts' and (k.fact ->> 'count')::bigint = 0)
      and to_regclass('public.donation_receipt_number_seq') is not null then
    perform setval('public.donation_receipt_number_seq', s.last_value + receipt_number_margin, s.is_called)
    from public.donation_receipt_number_seq s;
    receipt_numbers_skipped := receipt_number_margin;
  end if;

  return erasures || ' ' || credentials || ' ' || roles || ' ' || admin_actions || ' ' || receipt_numbers_skipped;
end
$$;
