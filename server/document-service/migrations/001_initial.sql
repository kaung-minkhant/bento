CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE documents (
  doc_id text PRIMARY KEY,
  owner_subject text NOT NULL,
  format text NOT NULL,
  current_version_id uuid,
  metadata_ciphertext text NOT NULL,
  metadata_nonce text NOT NULL,
  metadata_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE document_versions (
  version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text NOT NULL REFERENCES documents (doc_id),
  object_key text NOT NULL UNIQUE,
  ciphertext_sha256 text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_by_subject text NOT NULL,
  parent_version_id uuid REFERENCES document_versions (version_id),
  label_ciphertext text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents
  ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES document_versions (version_id);

CREATE TABLE document_recovery (
  doc_id text PRIMARY KEY REFERENCES documents (doc_id),
  object_key text NOT NULL UNIQUE,
  ciphertext_sha256 text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE document_members (
  doc_id text NOT NULL REFERENCES documents (doc_id),
  subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'reader')),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  PRIMARY KEY (doc_id, subject)
);

CREATE TABLE document_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id text NOT NULL REFERENCES documents (doc_id),
  relay_room text NOT NULL,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX documents_owner_updated_idx
  ON documents (owner_subject, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX document_members_subject_idx
  ON document_members (subject)
  WHERE revoked_at IS NULL;

CREATE INDEX document_versions_doc_created_idx
  ON document_versions (doc_id, created_at DESC);

CREATE INDEX document_recovery_expiry_idx
  ON document_recovery (expires_at);

CREATE INDEX document_sessions_doc_active_idx
  ON document_sessions (doc_id, last_seen_at DESC)
  WHERE closed_at IS NULL;
