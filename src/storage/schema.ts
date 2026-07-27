import type Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

// Schema per specs/003-sqlite-document-index/data-model.md, itself
// drawn from specs/000-tome-core/tdd.md. Applied on every open — all
// statements are idempotent (IF NOT EXISTS) so re-opening an existing
// database file is safe.

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sources (
  id              TEXT    PRIMARY KEY,
  type            TEXT    NOT NULL CHECK(type IN ('url', 'path', 'git')),
  origin          TEXT    NOT NULL,
  added_at        INTEGER NOT NULL,
  last_indexed_at INTEGER,
  status          TEXT    NOT NULL CHECK(status IN ('pending', 'indexing', 'ready', 'error')),
  error           TEXT
);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT    PRIMARY KEY,
  source_id    TEXT    NOT NULL REFERENCES sources(id),
  uri          TEXT    NOT NULL,
  title        TEXT,
  content_hash TEXT    NOT NULL,
  fetched_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chunks (
  id          TEXT    PRIMARY KEY,
  document_id TEXT    NOT NULL REFERENCES documents(id),
  ordinal     INTEGER NOT NULL,
  text        TEXT    NOT NULL,
  token_count INTEGER NOT NULL
);

-- sqlite-vec virtual table for ANN search. Schema only in this
-- milestone: never inserted into or queried until milestone 005's
-- Embedder exists.
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(
  embedding float[768]
);

-- FTS5 virtual table for lexical search, external-content over chunks.
CREATE VIRTUAL TABLE IF NOT EXISTS chunk_text_fts USING fts5(
  text, content='chunks', content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
  INSERT INTO chunk_text_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
  INSERT INTO chunk_text_fts(chunk_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunk_text_fts(chunk_text_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO chunk_text_fts(rowid, text) VALUES (new.rowid, new.text);
END;
`;

export function applySchema(db: Database.Database): void {
  sqliteVec.load(db);
  db.exec(SCHEMA_SQL);
}
