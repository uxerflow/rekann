-- Existing app environments use rekann_runtime. Fresh/local databases may not have it.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rekann_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON waitlist_subscriber TO rekann_runtime;
  END IF;
END $$;
