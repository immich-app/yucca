export enum CookieName {
  AccessToken = 'yucca-access-token',
  OidcState = 'yucca-oidc-state',
  OidcCodeVerifier = 'yucca-oidc-code-verifier',
  InviteCode = 'yucca-invite-code',
  DiscordInvite = 'yucca-discord-invite',
  RedirectPath = 'yucca-redirect-path',
}

export enum TicketAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

export enum MetadataKey {
  Auth = 'AUTH',
  Feature = 'FEATURE',
}

export enum DatabaseLock {
  Migrations = 67,
}
