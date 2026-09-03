export enum CookieName {
  NextUrl = 'sdk-next',
  OidcState = 'sdk-oidc-state',
  OidcCodeVerifier = 'sdk-oidc-code-verifier',
  SessionToken = 'sdk-session',
  YuccaAccessToken = 'yucca-access-token',
  YuccaOidcState = 'yucca-oidc-state',
  YuccaOidcCodeVerifier = 'yucca-oidc-code-verifier',
}

export enum ImmichCookie {
  MaintenanceToken = 'immich_maintenance_token',
}

export enum TicketAction {
  DeleteRepository = 'repository.delete',
  DisableWorm = 'repository.disable-worm',
}

export enum ConfigurationKey {
  EncryptionKey = 'encryption-key',
  OnboardedKey = 'onboarded-key',
  Telemetry = 'telemetry',
  SkippedOnboardingExtraConfig = 'skipped-onboarding-extra-config',
  ResticOptionRestConnections = 'restic-o-rest-connections',
  SessionSecret = 'session-secret',
}

export enum MetadataKey {
  PublicRoute = 'public-route',
}

export enum BackendType {
  Yucca = 'yucca',
  Local = 'local',
  S3 = 's3',
}

export enum TaskStatus {
  Incomplete = 'incomplete',
  Complete = 'complete',
  Warn = 'warn',
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

export enum DeviceFlowEventType {
  Start = 'START',
  Success = 'SUCCESS',
  Failure = 'FAILURE',
}

export enum DeviceFlowFailureReason {
  NotConnected = 'NOT_CONNECTED',
  DeviceFlowFailed = 'DEVICE_FLOW_FAILED',
  WrongAccount = 'WRONG_ACCOUNT',
  Unknown = 'UNKNOWN',
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

export enum ResticTagPrefix {
  ImmichBackupFileName = 'yucca.v1.immichBackupFileName',
}
