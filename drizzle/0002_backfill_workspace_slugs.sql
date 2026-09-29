DO $$
DECLARE
  item record;
  base text;
  candidate text;
  suffix integer;
BEGIN
  FOR item IN SELECT id, name FROM workspace WHERE slug IS NULL ORDER BY created_at, id LOOP
    base := trim(both '-' from left(regexp_replace(lower(item.name), '[^a-z0-9]+', '-', 'g'), 48));
    IF base = '' THEN base := 'workspace'; END IF;
    candidate := base;
    suffix := 2;
    WHILE EXISTS (SELECT 1 FROM workspace WHERE slug = candidate) LOOP
      candidate := base || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;
    UPDATE workspace SET slug = candidate WHERE id = item.id;
  END LOOP;
END $$;
