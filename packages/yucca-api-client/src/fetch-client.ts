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
    baseUrl: "/"
};
const oazapfts = Oazapfts.runtime(defaults);
export const servers = {
    server1: "/"
};
export type AuthDto = {
    id: string;
    name: string;
    email: string;
    sessionId: string;
};
export type SubmitBackupEndRequestDto = {
    success: boolean;
    durationMs: number;
};
export type SubmitUpdateSizeRequestDto = {
    sizeBytes: number;
};
export type RepositoryMetricsHistoryDto = {
    id: string;
    repositoryId: string;
    createdAt: string;
    sizeBytes?: number;
    started?: string;
    backup?: string;
    successfulBackup?: string;
    backupDuration?: number;
};
export type RepositoryMetricsHistoryListResponseDto = {
    items: RepositoryMetricsHistoryDto[];
    nextCursor?: string | null;
};
export type RepositoryCreateRequestDto = {
    name: string;
    worm: boolean;
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
export type RepositoryWithMetricsDto = {
    id: string;
    worm: boolean;
    name: string;
    metrics: RepositoryMetricsDto;
    meter?: RepositoryMeterDto;
};
export type RepositoryCreateResponseDto = {
    repository: RepositoryWithMetricsDto;
};
export type RepositoryListResponseDto = {
    repositories: RepositoryWithMetricsDto[];
};
export type RepositoryGetResponseDto = {
    repository: RepositoryWithMetricsDto;
};
export type RepositoryUpdateRequestDto = {
    name?: string;
    worm?: boolean;
};
export type RepositoryUpdateResponseDto = {
    repository: RepositoryWithMetricsDto;
};
export type RepositoryCreateResticUrlDto = {
    url: string;
};
export function getAuth(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: AuthDto;
    }>("/api/auth", {
        ...opts
    }));
}
export function logout(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/auth/logout", {
        ...opts
    }));
}
export function oidcAuthorize(codeChallenge: string, state: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/oidc/login${QS.query(QS.explode({
        code_challenge: codeChallenge,
        state
    }))}`, {
        ...opts
    }));
}
export function oidcCallback(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/auth/oidc/callback", {
        ...opts
    }));
}
export function oidcDeviceFlow(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/auth/oidc/device", {
        ...opts
    }));
}
export function submitMetricBackupStart(repositoryId: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/metrics/submit/${encodeURIComponent(repositoryId)}/backup/start`, {
        ...opts,
        method: "POST"
    }));
}
export function submitMetricBackupEnd(repositoryId: string, submitBackupEndRequestDto: SubmitBackupEndRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/metrics/submit/${encodeURIComponent(repositoryId)}/backup/end`, oazapfts.json({
        ...opts,
        method: "POST",
        body: submitBackupEndRequestDto
    })));
}
export function submitMetricRepositorySize(repositoryId: string, submitUpdateSizeRequestDto: SubmitUpdateSizeRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/metrics/submit/${encodeURIComponent(repositoryId)}/size`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: submitUpdateSizeRequestDto
    })));
}
export function listMetricsHistory(repositoryId: string, { cursor, limit }: {
    cursor?: string;
    limit?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryMetricsHistoryListResponseDto;
    }>(`/api/metrics/${encodeURIComponent(repositoryId)}/history${QS.query(QS.explode({
        cursor,
        limit
    }))}`, {
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
export function getRepository(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryGetResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}`, {
        ...opts
    }));
}
export function updateRepository(id: string, repositoryUpdateRequestDto: RepositoryUpdateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryUpdateResponseDto;
    }>(`/api/repository/${encodeURIComponent(id)}`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: repositoryUpdateRequestDto
    })));
}
export function deleteRepository(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/${encodeURIComponent(id)}`, {
        ...opts,
        method: "DELETE"
    }));
}
export function createResticUrl(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResticUrlDto;
    }>(`/api/repository/${encodeURIComponent(id)}/restic`, {
        ...opts,
        method: "POST"
    }));
}
