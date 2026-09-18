-- Full-text search across bookmark titles and notes (brief §3.4 bonus, ADR-020c).
-- Expression index so `to_tsvector('english', title || ' ' || notes)` queries can use it.
CREATE INDEX "Bookmark_search_idx"
  ON "Bookmark"
  USING GIN (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("notes", '')));
