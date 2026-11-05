create or replace function pg_temp.end_sessions() returns bigint language plpgsql as $$
declare
  ended bigint := 0;
begin
  if to_regclass('public.donor_refresh_token') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'donor_refresh_token' and column_name = 'used_at') then
      with revoked as (
        update public.donor_refresh_token set revoked_at = now() where revoked_at is null returning used_at, expires_at)
      select count(*) into ended from revoked where used_at is null and expires_at > now();
    else
      with revoked as (
        update public.donor_refresh_token set revoked_at = now() where revoked_at is null returning expires_at)
      select count(*) into ended from revoked where expires_at > now();
    end if;
  end if;
  if to_regclass('public.donor_device') is not null then
    update public.donor_device set ended_at = now(), end_reason = 'EXPIRED' where ended_at is null;
  end if;
  return ended;
end
$$;

create or replace function pg_temp.spend_one_time_secrets() returns bigint language plpgsql as $$
declare
  one_time_table text;
  spent bigint;
  total bigint := 0;
begin
  foreach one_time_table in array array[
      'donor_password_reset_token',
      'donor_email_verification_token',
      'donor_second_factor_challenge',
      'donor_second_factor_recovery',
      'donor_passkey_challenge',
      'oauth_authorization_code'] loop
    if to_regclass('public.' || one_time_table) is not null then
      execute format('with spent as (update public.%I set used_at = now() where used_at is null returning expires_at) '
                     'select count(*) from spent where expires_at > now()', one_time_table) into spent;
      total := total + spent;
    end if;
  end loop;
  return total;
end
$$;
