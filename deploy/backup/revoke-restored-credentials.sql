create or replace function pg_temp.end_sessions() returns bigint language plpgsql as $$
begin
  return 0;
end
$$;

create or replace function pg_temp.spend_one_time_secrets() returns bigint language plpgsql as $$
begin
  return 0;
end
$$;
