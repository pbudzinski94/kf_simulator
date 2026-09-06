PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE app_data (     id INTEGER PRIMARY KEY,     data TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE weapons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name_key TEXT,
  attack_dice INTEGER NOT NULL CHECK (attack_dice BETWEEN 0 AND 20),
  attack_bonus INTEGER NOT NULL CHECK (attack_bonus BETWEEN -20 AND 20),
  bonus_damage INTEGER NOT NULL CHECK (bonus_damage BETWEEN 0 AND 50),
  per_hit_red INTEGER NOT NULL CHECK (per_hit_red BETWEEN 0 AND 20),
  per_hit_black INTEGER NOT NULL CHECK (per_hit_black BETWEEN 0 AND 20),
  per_hit_white INTEGER NOT NULL CHECK (per_hit_white BETWEEN 0 AND 20),
  extra_dice_red INTEGER NOT NULL CHECK (extra_dice_red BETWEEN 0 AND 20),
  extra_dice_black INTEGER NOT NULL CHECK (extra_dice_black BETWEEN 0 AND 20),
  extra_dice_white INTEGER NOT NULL CHECK (extra_dice_white BETWEEN 0 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
DELETE FROM sqlite_sequence;
CREATE INDEX weapons_name_idx ON weapons(name COLLATE NOCASE);

CREATE UNIQUE INDEX weapons_name_key_unique ON weapons(name_key);
