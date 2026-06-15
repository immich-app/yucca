/**
 * yucca
 * 1.0.0
 * DO NOT MODIFY - This file has been generated using oazapfts.
 * See https://www.npmjs.com/package/oazapfts
 */
import * as Oazapfts from "@oazapfts/runtime";
import * as QS from "@oazapfts/runtime/query";
export const defaults: Oazapfts.Defaults<Oazapfts.CustomHeaders> = {
    headers: {},
    baseUrl: "http://localhost:22676"
};
const oazapfts = Oazapfts.runtime(defaults);
export const servers = {
    server1: "http://localhost:22676"
};
export type DeviceFlowResponseDto = {
    userCode: string;
    verificationUri: string;
};
export type BackendType = "yucca" | "local" | "s3";
export type BackendDto = {
    id: string;
    "type": BackendType;
    isOnline: boolean;
    error?: string;
};
export type BackendsResponseDto = {
    backends: BackendDto[];
};
export type CreateLocalBackendRequestDto = {
    path: string;
};
export type BackendResponseDto = {
    backend: BackendDto;
};
export type FilesystemListingItemDto = {
    path: string;
    isDirectory: boolean;
};
export type FilesystemListingResponseDto = {
    parent: string;
    path: string;
    items: FilesystemListingItemDto[];
};
export type ImmichLibraryDto = {
    id: string;
    name: string;
    importPaths: string[];
    exclusionPatterns: string[];
};
export type ImmichStateDto = {
    dataPath: string;
    dataFolders: string[];
    libraries: ImmichLibraryDto[];
};
export type ImmichIntegrationConfigurationDto = {
    dataFolders: string[];
    backupConfiguration: boolean;
    libraries: "all" | string[];
};
export type ImmichIntegrationDto = {
    id: string;
    scheduleId: string;
    configuration: ImmichIntegrationConfigurationDto;
};
export type IntegrationsResponseDto = {
    immichState?: ImmichStateDto;
    immichIntegration?: ImmichIntegrationDto;
};
export type RetentionPolicyDto = {
    keepLast?: number;
    keepWithin?: string;
    keepWithinHourly?: string;
    keepWithinDaily?: string;
    keepWithinWeekly?: string;
    keepWithinMonthly?: string;
    keepWithinYearly?: string;
};
export type ConfigureImmichIntegrationRequestDto = {
    name: string;
    worm: boolean;
    cron: string;
    dataFolders: string[];
    backupConfiguration: boolean;
    libraries: "all" | string[];
    retentionPolicy?: (RetentionPolicyDto) | null;
};
export type OnboardingStatusResponseDto = {
    hasOnboardedKey: boolean;
    hasBackend: boolean;
    hasBackup: boolean;
    hasSchedule: boolean;
    hasSkippedExtraConfig: boolean;
};
export type CurrentRecoveryKeyResponse = {
    recoveryKey: string;
};
export type ImportRecoveryKeyRequest = {
    recoveryKey: string;
};
export type RepositoryCreateRequestDto = {
    name: string;
    worm: boolean;
    paths?: string[];
};
export type RepositoryMetricsDto = {
    lastBackup?: string;
    lastSuccessfulBackup?: string;
    lastBackupDuration?: number;
    sizeBytes: number;
};
export type RepositoryMeterDto = {
    sizeBytes: number;
    objectCount: number;
    lastUpdated?: string;
};
export type RepositoryBackendDto = {
    id: string;
    "type": BackendType;
    online: boolean;
};
export type RepositoryBackendsDto = {
    primary: RepositoryBackendDto;
    secondary: RepositoryBackendDto[];
};
export type RepositoryConfigurationDto = {
    paths: string[];
    retentionPolicy?: (RetentionPolicyDto) | null;
};
export type LocalRepositoryDto = {
    id: string;
    worm: boolean;
    name: string;
    metrics: RepositoryMetricsDto;
    meter?: RepositoryMeterDto;
    backends?: RepositoryBackendsDto;
    configuration?: RepositoryConfigurationDto;
};
export type RepositoryCreateResponseDto = {
    repository: LocalRepositoryDto;
};
export type RepositoryListResponseDto = {
    repositories: LocalRepositoryDto[];
};
export type SnapshotSummaryDto = {
    filesNew: number;
    filesChanged: number;
    filesUnmodified: number;
    totalFiles: number;
    totalBytes: number;
    dataAdded: number;
};
export type SnapshotDto = {
    id: string;
    time: string;
    paths: string[];
    summary?: SnapshotSummaryDto;
};
export type InspectedLocalRepositoryDto = {
    id: string;
    worm: boolean;
    name: string;
    metrics: RepositoryMetricsDto;
    meter?: RepositoryMeterDto;
    backends?: RepositoryBackendsDto;
    configuration?: RepositoryConfigurationDto;
    snapshots: SnapshotDto[];
};
export type RepositoryInspectResponseDto = {
    repositories: InspectedLocalRepositoryDto[];
};
export type RepositoryUpdateRequestDto = {
    name?: string;
    paths?: string[];
    retentionPolicy?: (RetentionPolicyDto) | null;
};
export type RepositoryUpdateResponseDto = {
    repository: LocalRepositoryDto;
};
export type LogResponseDto = {
    logId: string;
};
export type RepositoryCheckImportResponseDto = {
    readable: boolean;
};
export type RunStatus = "incomplete" | "complete" | "failed";
export type RunType = "schedule" | "restore" | "backup" | "forget";
export type RunDto = {
    id: string;
    repositoryId: string;
    start: string;
    end: string;
    logFilePath: string;
    status: RunStatus;
    "type": RunType;
};
export type RunHistoryResponseDto = {
    runs: RunDto[];
};
export type ListSnapshotsResponseDto = {
    snapshots: SnapshotDto[];
};
export type RepositorySnapshotRestoreRequestDto = {
    target?: string;
    include?: string[];
};
export type RepositorySnapshotRestoreFromPointRequestDto = {
    yuccaConfig?: string;
    include?: string[];
};
export type RunResponseDto = {
    run: RunDto;
};
export type TaskType = "schedule" | "restore" | "backup" | "forget";
export type TaskStatus = "incomplete" | "complete" | "failed";
export type ActiveScheduleItemDto = {
    repositoryId: string;
    status: TaskStatus;
};
export type RunningTaskDto = {
    parentId: string;
    "type": TaskType;
    logId?: string;
    scheduleStatus?: ActiveScheduleItemDto[];
};
export type RunningTaskListResponse = {
    tasks: RunningTaskDto[];
};
export type ScheduleCreateRequestDto = {
    name: string;
    cron: string;
    repositories: string[];
};
export type ScheduleDto = {
    id: string;
    name: string;
    paused: boolean;
    cron: string;
    repositories: string[];
    lastRun?: string;
    lastFinished?: string;
};
export type ScheduleCreateResponseDto = {
    schedule: ScheduleDto;
};
export type ScheduleListResponseDto = {
    schedules: ScheduleDto[];
};
export type ScheduleUpdateRequestDto = {
    name?: string;
    paused?: boolean;
    cron?: string;
    repositories?: string[];
};
export type ScheduleUpdateResponseDto = {
    schedule: ScheduleDto;
};
export function oidcDeviceFlow(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: DeviceFlowResponseDto;
    }>("/api/yucca/auth/oidc/device", {
        ...opts
    }));
}
export function getBackends(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: BackendsResponseDto;
    }>("/api/yucca/backend", {
        ...opts
    }));
}
export function createLocalBackend(createLocalBackendRequestDto: CreateLocalBackendRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: BackendResponseDto;
    }>("/api/yucca/backend/local", oazapfts.json({
        ...opts,
        method: "POST",
        body: createLocalBackendRequestDto
    })));
}
export function resetOrchestrator(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/yucca/debug/reset", {
        ...opts,
        method: "POST"
    }));
}
export function getFileListing({ path }: {
    path?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: FilesystemListingResponseDto;
    }>(`/api/yucca/fs${QS.query(QS.explode({
        path
    }))}`, {
        ...opts
    }));
}
export function getIntegrations(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: IntegrationsResponseDto;
    }>("/api/yucca/integrations", {
        ...opts
    }));
}
export function configureImmichIntegration(configureImmichIntegrationRequestDto: ConfigureImmichIntegrationRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/yucca/integrations/immich", oazapfts.json({
        ...opts,
        method: "POST",
        body: configureImmichIntegrationRequestDto
    })));
}
export function onboardingStatus(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: OnboardingStatusResponseDto;
    }>("/api/yucca/onboarding", {
        ...opts
    }));
}
export function currentRecoveryKey(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: CurrentRecoveryKeyResponse;
    }>("/api/yucca/onboarding/recovery-key", {
        ...opts
    }));
}
export function importRecoveryKey(importRecoveryKeyRequest: ImportRecoveryKeyRequest, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/yucca/onboarding/recovery-key", oazapfts.json({
        ...opts,
        method: "PUT",
        body: importRecoveryKeyRequest
    })));
}
export function confirmRecoveryKey(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/yucca/onboarding/recovery-key", {
        ...opts,
        method: "POST"
    }));
}
export function skipOnboardingExtraConfig(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/yucca/onboarding/skip", {
        ...opts,
        method: "POST"
    }));
}
export function createRepository(repositoryCreateRequestDto: RepositoryCreateRequestDto, { backend }: {
    backend?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResponseDto;
    }>(`/api/yucca/repository${QS.query(QS.explode({
        backend
    }))}`, oazapfts.json({
        ...opts,
        method: "POST",
        body: repositoryCreateRequestDto
    })));
}
export function getRepositories(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryListResponseDto;
    }>("/api/yucca/repository", {
        ...opts
    }));
}
export function inspectRepositories(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryInspectResponseDto;
    }>("/api/yucca/repository/inspect", {
        ...opts
    }));
}
export function updateRepository(id: string, repositoryUpdateRequestDto: RepositoryUpdateRequestDto, { backend }: {
    backend?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryUpdateResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}${QS.query(QS.explode({
        backend
    }))}`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: repositoryUpdateRequestDto
    })));
}
export function deleteRepository(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/yucca/repository/${encodeURIComponent(id)}`, {
        ...opts,
        method: "DELETE"
    }));
}
export function createBackup(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}`, {
        ...opts,
        method: "POST"
    }));
}
export function checkImportRepository(id: string, backend: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCheckImportResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/import${QS.query(QS.explode({
        backend
    }))}`, {
        ...opts
    }));
}
export function importRepository(id: string, backend: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/import${QS.query(QS.explode({
        backend
    }))}`, {
        ...opts,
        method: "POST"
    }));
}
export function getRunHistory(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RunHistoryResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/runs`, {
        ...opts
    }));
}
export function getSnapshots(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ListSnapshotsResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots`, {
        ...opts
    }));
}
export function pruneRepository(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots/prune`, {
        ...opts,
        method: "POST"
    }));
}
export function restoreSnapshot(id: string, snapshot: string, repositorySnapshotRestoreRequestDto: RepositorySnapshotRestoreRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot)}`, oazapfts.json({
        ...opts,
        method: "POST",
        body: repositorySnapshotRestoreRequestDto
    })));
}
export function forgetSnapshot(id: string, snapshot: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ListSnapshotsResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot)}`, {
        ...opts,
        method: "DELETE"
    }));
}
export function restoreFromPoint(id: string, snapshot: string, backend: string, repositorySnapshotRestoreFromPointRequestDto: RepositorySnapshotRestoreFromPointRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot)}/restore-from-point${QS.query(QS.explode({
        backend
    }))}`, oazapfts.json({
        ...opts,
        method: "POST",
        body: repositorySnapshotRestoreFromPointRequestDto
    })));
}
export function getSnapshotListing(id: string, snapshot: string, { path }: {
    path?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: FilesystemListingResponseDto;
    }>(`/api/yucca/repository/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot)}/listing${QS.query(QS.explode({
        path
    }))}`, {
        ...opts
    }));
}
export function getRun(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RunResponseDto;
    }>(`/api/yucca/logs/${encodeURIComponent(id)}`, {
        ...opts
    }));
}
export function logStreamSse(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/yucca/logs/${encodeURIComponent(id)}/stream`, {
        ...opts
    }));
}
export function getRunningTasks(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RunningTaskListResponse;
    }>("/api/yucca/tasks", {
        ...opts
    }));
}
export function cancelTask(parentId: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/yucca/tasks/${encodeURIComponent(parentId)}/cancel`, {
        ...opts,
        method: "POST"
    }));
}
export function createSchedule(scheduleCreateRequestDto: ScheduleCreateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ScheduleCreateResponseDto;
    }>("/api/yucca/schedule", oazapfts.json({
        ...opts,
        method: "POST",
        body: scheduleCreateRequestDto
    })));
}
export function getSchedules(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ScheduleListResponseDto;
    }>("/api/yucca/schedule", {
        ...opts
    }));
}
export function updateSchedule(id: string, scheduleUpdateRequestDto: ScheduleUpdateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ScheduleUpdateResponseDto;
    }>(`/api/yucca/schedule/${encodeURIComponent(id)}`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: scheduleUpdateRequestDto
    })));
}
export function removeSchedule(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/yucca/schedule/${encodeURIComponent(id)}`, {
        ...opts,
        method: "DELETE"
    }));
}
