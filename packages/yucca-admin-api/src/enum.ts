export enum CookieName {
  Sub = 'yucca-admin-sub',
  AccessToken = 'yucca-admin-access-token',
  OidcState = 'yucca-admin-oidc-state',
  OidcCodeVerifier = 'yucca-admin-oidc-code-verifier',
  CliLogin = 'yucca-admin-cli-login',
}

export enum TicketAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

export enum AuditAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

// Audiences of the ES256 JWTs this service mints for the CLI login flow.
export enum JwtAudience {
  // One-time authorization code handed to the loopback redirect (short TTL).
  CliCode = 'yucca-admin-cli-code',
  // CLI session token sent as `Authorization: Bearer`.
  Cli = 'yucca-admin-cli',
}

export enum MetadataKey {
  Auth = 'AUTH',
}

export enum DatabaseLock {
  Migrations = 67,
}
