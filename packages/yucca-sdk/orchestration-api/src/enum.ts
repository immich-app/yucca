export enum CookieName {
  NextUrl = 'sdk-next',
  OidcState = 'sdk-oidc-state',
  OidcCodeVerifier = 'sdk-oidc-code-verifier',
  YuccaAccessToken = 'yucca-access-token',
  YuccaOidcState = 'yucca-oidc-state',
  YuccaOidcCodeVerifier = 'yucca-oidc-code-verifier',
}

export enum ConfigurationKey {
  EncryptionKey = 'encryption-key',
  OnboardedKey = 'onboarded-key',
  Telemetry = 'telemetry',
  SkippedOnboardingExtraConfig = 'skipped-onboarding-extra-config',
}

export enum BackendType {
  Yucca = 'yucca',
  Local = 'local',
  S3 = 's3',
}

export enum TaskStatus {
  Incomplete = 'incomplete',
  Complete = 'complete',
  Failed = 'failed',
}

export enum TaskType {
  Schedule = 'schedule',
  Restore = 'restore',
  Backup = 'backup',
  Forget = 'forget',
}

export enum InternalEvent {
  ModuleConfigUpdated = 'yucca.moduleConfig.updated',
}

export enum BootstrapStatus {
  NotReady = 'not-ready',
  Ready = 'ready',
  Error = 'error',
}

export enum TelemetryLevel {
  Full = 'full',
  None = 'none',
}
