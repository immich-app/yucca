export enum CookieName {
  AccessToken = 'access-token',
  OidcState = 'oidc-state',
  OidcCodeVerifier = 'oidc-code-verifier',
  AppCodeChallenge = 'app-code-challenge',
}

export enum ConfigurationKey {
  AccessToken = 'access-token',
  EncryptionKey = 'encryption-key',
}

export enum BackendType {
  Yucca = 'yucca',
  Local = 'local',
  S3 = 's3',
}
