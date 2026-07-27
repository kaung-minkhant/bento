CREATE TABLE user_vault_keys (
  owner_subject text PRIMARY KEY,
  wrapped_key_ciphertext text NOT NULL,
  wrapped_key_salt text NOT NULL,
  wrapped_key_nonce text NOT NULL,
  wrapped_key_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
