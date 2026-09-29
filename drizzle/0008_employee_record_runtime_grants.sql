DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rekann_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON employee_record TO rekann_runtime;
  END IF;
END $$;
