export enum CookieName {
  AccessToken = 'yucca-access-token',
  OidcState = 'yucca-oidc-state',
  OidcCodeVerifier = 'yucca-oidc-code-verifier',
  InviteCode = 'yucca-invite-code',
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
