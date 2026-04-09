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
export type RepositoryCreateRequestDto = {
    name: string;
    worm: boolean;
};
export type RepositoryMetricsDto = {
    lastBackup?: string;
    sizeBytes: number;
};
export type BackendType = "yucca" | "local" | "s3";
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
};
export type LocalRepositoryDto = {
    id: string;
    worm: boolean;
    name: string;
    metrics: RepositoryMetricsDto;
    backends?: RepositoryBackendsDto;
    configuration?: RepositoryConfigurationDto;
};
export type RepositoryCreateResponseDto = {
    repository: LocalRepositoryDto;
};
export type RepositoryListResponseDto = {
    repositories: LocalRepositoryDto[];
};
export type LogResponseDto = {
    logId: string;
};
export type RepositoryPathRequestDto = {
    path: string;
};
export type RunStatus = "incomplete" | "complete" | "failed";
export type RunDto = {
    id: string;
    start: string;
    end: string;
    logFilePath: string;
    status: RunStatus;
};
export type RunHistoryResponseDto = {
    runs: RunDto[];
};
export type SnapshotDto = {
    id: string;
    time: string;
};
export type ListSnapshotsResponseDto = {
    snapshots: SnapshotDto[];
};
export type BackendDto = {
    id: string;
    "type": BackendType;
    isOnline: boolean;
    error?: string;
};
export type BackendsResponseDto = {
    backends: BackendDto[];
};
export type FilesystemListingItemDto = {
    path: string;
    isDirectory: boolean[];
};
export type FilesystemListingResponseDto = {
    parent: string;
    path: string;
    items: FilesystemListingItemDto[];
};
export type OnboardingStatusResponseDto = {
    hasOnboardedKey: boolean;
    hasBackend: boolean;
};
export type CurrentRecoveryKeyResponse = {
    recoveryKey: string;
};
export type ImportRecoveryKeyRequest = {
    recoveryKey: string;
};
export function resetOrchestrator(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/debug", {
        ...opts
    }));
}
export function createRepository(repositoryCreateRequestDto: RepositoryCreateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResponseDto;
    }>("/api/repository", oazapfts.json({
        ...opts,
        method: "POST",
        body: repositoryCreateRequestDto
    })));
}
export function getRepositories(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryListResponseDto;
    }>("/api/repository", {
        ...opts
    }));
}
export function createBackup(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}`, {
        ...opts,
        method: "POST"
    }));
}
export function addRepositoryPath(id: string, repositoryPathRequestDto: RepositoryPathRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/${encodeURIComponent(id)}/paths`, oazapfts.json({
        ...opts,
        method: "PUT",
        body: repositoryPathRequestDto
    })));
}
export function removeRepositoryPath(id: string, repositoryPathRequestDto: RepositoryPathRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/${encodeURIComponent(id)}/paths`, oazapfts.json({
        ...opts,
        method: "DELETE",
        body: repositoryPathRequestDto
    })));
}
export function getRunHistory(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RunHistoryResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}/runs`, {
        ...opts
    }));
}
export function getSnapshots(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ListSnapshotsResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}/snapshots`, {
        ...opts
    }));
}
export function forgetSnapshot(id: string, snapshot: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ListSnapshotsResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}/snapshots/${encodeURIComponent(snapshot)}`, {
        ...opts,
        method: "DELETE"
    }));
}
export function logStreamSse(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/logs/${encodeURIComponent(id)}`, {
        ...opts
    }));
}
export function getBackends(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: BackendsResponseDto;
    }>("/api/backend", {
        ...opts
    }));
}
export function getFileListing({ path }: {
    path?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: FilesystemListingResponseDto;
    }>(`/api/fs${QS.query(QS.explode({
        path
    }))}`, {
        ...opts
    }));
}
export function oidcAuthorize(next: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/oidc/login${QS.query(QS.explode({
        next
    }))}`, {
        ...opts
    }));
}
export function oidcCallback(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/auth/oidc/callback", {
        ...opts
    }));
}
export function onboardingStatus(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: OnboardingStatusResponseDto;
    }>("/api/onboarding", {
        ...opts
    }));
}
export function currentRecoveryKey(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: CurrentRecoveryKeyResponse;
    }>("/api/onboarding/recovery-key", {
        ...opts
    }));
}
export function importRecoveryKey(importRecoveryKeyRequest: ImportRecoveryKeyRequest, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/onboarding/recovery-key", oazapfts.json({
        ...opts,
        method: "PUT",
        body: importRecoveryKeyRequest
    })));
}
export function confirmRecoveryKey(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/onboarding/recovery-key", {
        ...opts,
        method: "POST"
    }));
}
