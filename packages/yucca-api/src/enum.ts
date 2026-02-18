export enum CookieName {
  AccessToken = 'access-token',
  OidcState = 'oidc-state',
  OidcCodeVerifier = 'oidc-code-verifier',
  OidcLoginFlow = 'oidc-login-flow',
  AppCodeChallenge = 'app-code-challenge',
}

export enum MetadataKey {
  Auth = 'AUTH',
  OptionalAuth = 'OPTIONAL_AUTH',
}

export enum OidcLoginFlow {
  Default = 'default',
  App = 'app',
}
