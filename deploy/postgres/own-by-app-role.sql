DO $$
DECLARE
  relation record;
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'novanadeje_app') THEN
    RAISE EXCEPTION 'the role novanadeje_app does not exist';
  END IF;
  EXECUTE format('ALTER DATABASE %I OWNER TO novanadeje_app', current_database());
  ALTER SCHEMA public OWNER TO novanadeje_app;
  FOR relation IN
    SELECT c.oid::regclass::text AS name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND c.relowner <> 'novanadeje_app'::regrole
      AND NOT EXISTS (
        SELECT FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'i')
      )
  LOOP
    EXECUTE format('ALTER %s %s OWNER TO novanadeje_app',
      CASE relation.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        ELSE 'TABLE'
      END,
      relation.name);
  END LOOP;
END
$$;
