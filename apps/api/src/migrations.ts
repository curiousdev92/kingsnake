/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 * Append only: never edit a migration that may have run somewhere.
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE players (
    id uuid PRIMARY KEY,
    name text NOT NULL,
    xp integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
    coins integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
    equipped_skin text NOT NULL,
    daily_last_claim date,
    daily_streak integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE owned_items (
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_id text NOT NULL,
    acquired_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (player_id, item_id)
  );

  CREATE TABLE match_results (
    match_id text NOT NULL,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    placement integer NOT NULL,
    total_players integer NOT NULL,
    kills integer NOT NULL,
    survival_ms integer NOT NULL,
    xp integer NOT NULL,
    coins integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (match_id, player_id)
  );

  CREATE INDEX match_results_player ON match_results (player_id, created_at DESC)
  `,
  `
  ALTER TABLE players ADD COLUMN rating integer NOT NULL DEFAULT 1000;
  ALTER TABLE match_results ADD COLUMN rating_delta integer
  `,
  `
  CREATE TABLE season_ratings (
    season_id text NOT NULL,
    player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    rating integer NOT NULL,
    wins integer NOT NULL DEFAULT 0,
    losses integer NOT NULL DEFAULT 0,
    draws integer NOT NULL DEFAULT 0,
    reward_claimed boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (season_id, player_id)
  );

  CREATE INDEX season_ratings_board ON season_ratings (season_id, rating DESC, updated_at);

  ALTER TABLE players DROP COLUMN rating
  `,
];
