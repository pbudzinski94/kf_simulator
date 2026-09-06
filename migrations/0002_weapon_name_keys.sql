-- Apply once to an existing database, then backfill keys with scripts/weapon-name-keys.cjs.
ALTER TABLE weapons ADD COLUMN name_key TEXT;
CREATE UNIQUE INDEX weapons_name_key_unique ON weapons(name_key);
