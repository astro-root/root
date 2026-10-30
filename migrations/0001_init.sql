-- るーとの研究室 初期スキーマ
CREATE TABLE admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,           -- pbkdf2$iterations$salt_b64$hash_b64
  role          TEXT NOT NULL DEFAULT 'admin',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,           -- SHA-256(token)。生トークンはDBに保存しない
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  csrf       TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- 汎用設定（サイト/ナビ/フッター/SEO/表示/トップなど）。value は JSON
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Markdown本文を持つ固定ページ（about / terms / privacy）
CREATE TABLE pages (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  body_md     TEXT NOT NULL DEFAULT '',
  meta        TEXT NOT NULL DEFAULT '{}',  -- 構造化された補助情報(JSON)
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE projects (
  id           TEXT PRIMARY KEY,         -- URLスラッグ
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'Active',  -- 開発状況(Active / In Development / Concept / Archived)
  year         TEXT NOT NULL DEFAULT '',
  technology   TEXT NOT NULL DEFAULT '[]',
  url          TEXT,
  github       TEXT,
  thumbnail    TEXT,
  thumbnail_alt TEXT NOT NULL DEFAULT '',
  featured     INTEGER NOT NULL DEFAULT 0,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  state        TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','private')),
  published_at TEXT,
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_projects_state ON projects(state, sort_order);

CREATE TABLE posts (
  slug         TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  excerpt      TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  tags         TEXT NOT NULL DEFAULT '[]',
  thumbnail    TEXT,
  thumbnail_alt TEXT NOT NULL DEFAULT '',
  featured     INTEGER NOT NULL DEFAULT 0,
  state        TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','published','private')),
  published_at TEXT,
  seo_title    TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_posts_state ON posts(state, published_at);

CREATE TABLE contacts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  subject    TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','done')),
  admin_note TEXT NOT NULL DEFAULT '',
  ip_hash    TEXT NOT NULL DEFAULT '',   -- IPそのものは保存せず、ソルト付きハッシュのみ
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_contacts_status ON contacts(status, created_at);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,         -- epoch秒
  count        INTEGER NOT NULL
);

-- 画像。D1に直接保存（上限は API 側で制限）。/media/:id で配信
CREATE TABLE media (
  id         TEXT PRIMARY KEY,
  filename   TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  alt        TEXT NOT NULL DEFAULT '',
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
