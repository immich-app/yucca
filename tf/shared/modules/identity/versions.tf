terraform {
  required_version = "~> 1.11"
  # Pure data/transform module — no providers. It owns the canonical user +
  # group registry and exposes normalized views for each consumer (the switch
  # fabric today via `fabric_login`; servers next via `users` / `members_of`).
}
