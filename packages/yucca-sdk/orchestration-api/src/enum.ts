export enum CookieName {
  AccessToken = 'access-token',
  NextUrl = 'next',
  OidcState = 'oidc-state',
  OidcCodeVerifier = 'oidc-code-verifier',
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
