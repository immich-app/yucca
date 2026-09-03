export enum CookieName {
  AccessToken = 'yucca-access-token',
  OidcState = 'yucca-oidc-state',
  OidcCodeVerifier = 'yucca-oidc-code-verifier',
  InviteCode = 'yucca-invite-code',
  DiscordInvite = 'yucca-discord-invite',
  RedirectPath = 'yucca-redirect-path',
  TicketId = 'yucca-ticket-id',
  TicketToken = 'yucca-ticket-token',
}

export enum TicketAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

export enum AuditAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

export enum MetadataKey {
  Auth = 'AUTH',
  Feature = 'FEATURE',
}

export enum DeviceFlowEventType {
  Start = 'START',
  Success = 'SUCCESS',
  Failure = 'FAILURE',
}

export enum DeviceFlowFailureReason {
  Unknown = 'UNKNOWN',
  EmailNotAllowed = 'EMAIL_NOT_ALLOWED',
  FeatureNotEnabled = 'FEATURE_NOT_ENABLED',
}

export enum DatabaseLock {
  Migrations = 67,
}
