export enum CookieName {
  NextUrl = 'sdk-next',
  OidcState = 'sdk-oidc-state',
  OidcCodeVerifier = 'sdk-oidc-code-verifier',
  YuccaAccessToken = 'yucca-access-token',
  YuccaOidcState = 'yucca-oidc-state',
  YuccaOidcCodeVerifier = 'yucca-oidc-code-verifier',
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
