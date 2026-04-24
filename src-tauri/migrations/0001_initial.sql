-- VolleyScoutPro — SQLite schema v1
-- WAL/foreign_keys/synchronous are set at connection time via SqliteConnectOptions
-- ULID primary keys everywhere for offline-safe uniqueness

-- ─────────────────────────────────────────────
-- ORGANISATIONS & USERS
-- ─────────────────────────────────────────────

CREATE TABLE orgs (
  id          TEXT PRIMARY KEY,          -- ULID
  name        TEXT NOT NULL,
  short_name  TEXT,
  logo_path   TEXT,                       -- local file path
  created_at  INTEGER NOT NULL
);

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  name        TEXT NOT NULL,
  email       TEXT,
  role        TEXT NOT NULL DEFAULT 'scout',  -- 'admin' | 'scout' | 'viewer'
  color_hex   TEXT NOT NULL DEFAULT '#4A90E2',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

-- ─────────────────────────────────────────────
-- SEASONS & TOURNAMENTS
-- ─────────────────────────────────────────────

CREATE TABLE seasons (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  name        TEXT NOT NULL,              -- e.g. "2025/2026"
  start_date  TEXT,                       -- ISO date
  end_date    TEXT,
  is_active   INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE tournaments (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  season_id   TEXT NOT NULL REFERENCES seasons(id),
  name        TEXT NOT NULL,
  gender      TEXT NOT NULL DEFAULT 'M',  -- 'M' | 'F'
  level       TEXT,                       -- 'A1' | 'A2' | 'B' | ...
  created_at  INTEGER NOT NULL
);

-- ─────────────────────────────────────────────
-- TEAMS & PLAYERS
-- ─────────────────────────────────────────────

CREATE TABLE teams (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  name        TEXT NOT NULL,
  short_name  TEXT,
  is_own_team INTEGER NOT NULL DEFAULT 0, -- 1 = our team
  created_at  INTEGER NOT NULL
);

CREATE TABLE players (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  first_name  TEXT NOT NULL,
  last_name   TEXT NOT NULL,
  number      INTEGER NOT NULL,           -- jersey number
  role        TEXT NOT NULL,              -- 'S'|'OH'|'OP'|'MB'|'L'|'DS'
  is_libero   INTEGER NOT NULL DEFAULT 0,
  birth_date  TEXT,
  height_cm   INTEGER,
  hand        TEXT DEFAULT 'R',           -- 'R' | 'L'
  created_at  INTEGER NOT NULL
);

-- Many-to-many: player can play for multiple teams across seasons
CREATE TABLE team_players (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL REFERENCES teams(id),
  player_id   TEXT NOT NULL REFERENCES players(id),
  season_id   TEXT NOT NULL REFERENCES seasons(id),
  number      INTEGER NOT NULL,           -- jersey number this season
  role        TEXT NOT NULL,
  is_captain  INTEGER NOT NULL DEFAULT 0,
  is_libero   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (team_id, player_id, season_id)
);

-- ─────────────────────────────────────────────
-- MATCHES
-- ─────────────────────────────────────────────

CREATE TABLE matches (
  id            TEXT PRIMARY KEY,
  org_id        TEXT NOT NULL REFERENCES orgs(id),
  tournament_id TEXT REFERENCES tournaments(id),
  season_id     TEXT NOT NULL REFERENCES seasons(id),
  home_team_id  TEXT NOT NULL REFERENCES teams(id),
  away_team_id  TEXT NOT NULL REFERENCES teams(id),
  scouted_team  TEXT NOT NULL DEFAULT 'home',  -- 'home' | 'away' | 'both'
  date          TEXT NOT NULL,            -- ISO datetime
  venue         TEXT,
  phase         TEXT NOT NULL DEFAULT 'not_started',
  -- 'not_started' | 'in_progress' | 'finished' | 'abandoned'
  winning_team  TEXT,                     -- 'home' | 'away' | NULL
  sets_home     INTEGER NOT NULL DEFAULT 0,
  sets_away     INTEGER NOT NULL DEFAULT 0,
  video_path    TEXT,                     -- local video file
  video_sync_offset_ms INTEGER,          -- start of first action in video
  notes         TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE sets (
  id          TEXT PRIMARY KEY,
  match_id    TEXT NOT NULL REFERENCES matches(id),
  set_number  INTEGER NOT NULL,           -- 1-5
  score_home  INTEGER NOT NULL DEFAULT 0,
  score_away  INTEGER NOT NULL DEFAULT 0,
  winner      TEXT,                       -- 'home' | 'away'
  duration_s  INTEGER,
  started_at  INTEGER,
  ended_at    INTEGER,
  UNIQUE (match_id, set_number)
);

CREATE TABLE rallies (
  id          TEXT PRIMARY KEY,
  match_id    TEXT NOT NULL REFERENCES matches(id),
  set_id      TEXT NOT NULL REFERENCES sets(id),
  rally_num   INTEGER NOT NULL,           -- monotonic per set
  score_home_before INTEGER NOT NULL,
  score_away_before INTEGER NOT NULL,
  serving_team TEXT NOT NULL,             -- 'home' | 'away'
  point_team  TEXT,                       -- 'home' | 'away' | NULL (unfinished)
  duration_ms INTEGER,
  video_ts_start_ms INTEGER,             -- video timestamp
  video_ts_end_ms   INTEGER
);

-- ─────────────────────────────────────────────
-- FORMATIONS / ROTATIONS
-- ─────────────────────────────────────────────

CREATE TABLE set_formations (
  id            TEXT PRIMARY KEY,
  match_id      TEXT NOT NULL REFERENCES matches(id),
  set_id        TEXT NOT NULL REFERENCES sets(id),
  set_number    INTEGER NOT NULL,
  team_side     TEXT NOT NULL,            -- 'home' | 'away'
  -- positions 1-6 (position 1 = server)
  pos1_player_id TEXT REFERENCES players(id),
  pos2_player_id TEXT REFERENCES players(id),
  pos3_player_id TEXT REFERENCES players(id),
  pos4_player_id TEXT REFERENCES players(id),
  pos5_player_id TEXT REFERENCES players(id),
  pos6_player_id TEXT REFERENCES players(id),
  setter_id      TEXT REFERENCES players(id),
  libero1_id     TEXT REFERENCES players(id),
  libero2_id     TEXT REFERENCES players(id),
  -- how was this entered
  entry_method   TEXT NOT NULL DEFAULT 'manual',
  -- 'manual' | 'reconstructed_from_serves' | 'imported_dvw'
  is_confirmed   INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL,
  UNIQUE (match_id, set_number, team_side)
);

-- ─────────────────────────────────────────────
-- EVENT LOG (append-only — never UPDATE or DELETE)
-- ─────────────────────────────────────────────

CREATE TABLE events (
  id              TEXT PRIMARY KEY,       -- ULID
  match_id        TEXT NOT NULL REFERENCES matches(id),
  set_id          TEXT REFERENCES sets(id),
  rally_id        TEXT REFERENCES rallies(id),
  sequence        INTEGER NOT NULL,       -- monotonic per match, starts at 1
  timestamp_ms    INTEGER NOT NULL,       -- wall clock at entry time
  video_ts_ms     INTEGER,               -- video timestamp if synced
  type            TEXT NOT NULL,
  -- TECHNICAL: 'serve_in'|'serve_out'|'reception'|'set'|'attack'|'block'|'dig'|'freeball'
  -- META:      'rally_end'|'point_home'|'point_away'|'timeout'|'substitution'
  -- SYSTEM:    'undo'|'match_start'|'set_start'|'set_end'|'match_end'|'formation_enter'
  -- SETTER:    'setter_call'
  actor_user_id   TEXT NOT NULL REFERENCES users(id),
  player_id       TEXT REFERENCES players(id),
  team_side       TEXT,                   -- 'home' | 'away'
  raw_code        TEXT,                   -- original DV4 string as typed
  -- parsed fields (denormalized for query performance)
  skill           TEXT,                   -- S R A B D E F
  skill_type      TEXT,
  quality         TEXT,                   -- = / - ! + #
  combination     TEXT,
  zone_from       INTEGER,
  zone_to         INTEGER,
  zone_to_sub     TEXT,
  end_zone_plus   TEXT,
  -- full payload as JSON (preserves everything, including future fields)
  payload         TEXT NOT NULL DEFAULT '{}',
  is_valid        INTEGER NOT NULL DEFAULT 1,
  -- undo fields (set when a later UNDO event targets this sequence)
  undone_at_ms    INTEGER,
  undone_by_seq   INTEGER,
  created_at      INTEGER NOT NULL
  -- CONSTRAINT enforced in application: no UPDATE or DELETE ever
);

CREATE INDEX idx_events_match_seq    ON events(match_id, sequence);
CREATE INDEX idx_events_match_rally  ON events(match_id, rally_id);
CREATE INDEX idx_events_player       ON events(player_id);
CREATE INDEX idx_events_type         ON events(type);

-- ─────────────────────────────────────────────
-- CONFIGURATION TABLES (per-org, per-season)
-- ─────────────────────────────────────────────

-- Attack combinations (tabella combinazioni di attacco)
CREATE TABLE attack_combinations (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id),
  season_id       TEXT REFERENCES seasons(id),   -- NULL = global default
  code            TEXT NOT NULL,                  -- 2-char DV4 code e.g. "X5", "PP"
  description     TEXT NOT NULL,
  ball_type       TEXT,    -- 'high'|'medium'|'quick'|'pipe'|'back_row'
  attacker_position TEXT,  -- 'OH'|'OP'|'MB'|'S_back_row'
  zone_from       INTEGER, -- preferred approach zone
  use_cones       INTEGER NOT NULL DEFAULT 0,
  trajectory_data TEXT,    -- JSON: visual representation config
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_attack_combinations_unique
  ON attack_combinations(org_id, code, COALESCE(season_id, ''));

-- Setter calls (K1-K9 codes)
CREATE TABLE setter_calls (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id),
  season_id       TEXT REFERENCES seasons(id),
  code            TEXT NOT NULL,          -- K1..K9
  description     TEXT NOT NULL,
  movement_data   TEXT,                   -- JSON: setter movement diagram
  set_zone_data   TEXT,                   -- JSON: target zone config
  color_hex       TEXT NOT NULL DEFAULT '#888888',
  is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_setter_calls_unique
  ON setter_calls(org_id, code, COALESCE(season_id, ''));

-- Compound code configuration (. notation rules)
CREATE TABLE compound_code_config (
  id              TEXT PRIMARY KEY,
  org_id          TEXT NOT NULL REFERENCES orgs(id),
  skill_a         TEXT NOT NULL,  -- first skill in pair e.g. 'S'
  skill_b         TEXT NOT NULL,  -- second skill e.g. 'R', 'A', 'B'
  quality_map     TEXT NOT NULL,  -- JSON {"#": "=", "+": "-", ...}
  propagate_type  INTEGER NOT NULL DEFAULT 0,
  propagate_zones INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1
);

-- Custom code shortcuts (user-defined abbreviations)
CREATE TABLE code_shortcuts (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  shortcut    TEXT NOT NULL,
  expands_to  TEXT NOT NULL,
  description TEXT,
  UNIQUE (org_id, shortcut)
);

-- ─────────────────────────────────────────────
-- CONFIG SNAPSHOTS (immutable audit trail)
-- ─────────────────────────────────────────────

CREATE TABLE config_snapshots (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL REFERENCES orgs(id),
  match_id    TEXT REFERENCES matches(id),
  snapshot    TEXT NOT NULL,  -- JSON blob of all config at match start
  created_at  INTEGER NOT NULL
);

-- ─────────────────────────────────────────────
-- SYNC STATE (cloud sync metadata)
-- ─────────────────────────────────────────────

CREATE TABLE sync_state (
  id              TEXT PRIMARY KEY DEFAULT '1',  -- single row
  last_sync_at    INTEGER,
  last_event_seq  INTEGER NOT NULL DEFAULT 0,
  pending_count   INTEGER NOT NULL DEFAULT 0,
  sync_status     TEXT NOT NULL DEFAULT 'idle'
  -- 'idle' | 'syncing' | 'error' | 'offline'
);

INSERT INTO sync_state (id, sync_status) VALUES ('1', 'idle');

-- ─────────────────────────────────────────────
-- APP STATE (window/UI persistence)
-- ─────────────────────────────────────────────

CREATE TABLE app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
