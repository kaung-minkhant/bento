CREATE UNIQUE INDEX document_sessions_active_room_idx
  ON document_sessions (doc_id, relay_room)
  WHERE closed_at IS NULL;
