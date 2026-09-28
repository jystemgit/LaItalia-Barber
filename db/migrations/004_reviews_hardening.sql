ALTER TABLE reviews
  ADD CONSTRAINT reviews_comment_max_length CHECK (char_length(comment) <= 2000) NOT VALID;

CREATE INDEX reviews_status_created_idx ON reviews(status, created_at DESC);