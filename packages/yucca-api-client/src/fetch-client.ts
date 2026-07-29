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
    connectionId?: string | null;
    features: {
        [key: string]: boolean;
    };
};
export type MetaConfigDto = {
    restic_pack_size_mib: number;
    /** Client-evaluated expression: integers, cores, min, max, + - * / */
    connections_math: string;
};
export type MetaConfigOverridesDto = {
    restic_pack_size_mib?: number;
    /** Client-evaluated expression: integers, cores, min, max, + - * / */
    connections_math?: string;
};
export type MetaClusterDto = {
    code: string;
    display_name: string;
    /** Per-cluster overrides of the global and site config */
    cluster_config: MetaConfigOverridesDto;
};
export type MetaSiteDto = {
    code: string;
    display_name: string;
    description: string;
    rest_url: string;
    default_cluster: string;
    /** Per-site overrides of the global config */
    site_config: MetaConfigOverridesDto;
    clusters: MetaClusterDto[];
};
export type MetaResponseDto = {
    api_root: string;
    config: MetaConfigDto;
    default_site: string;
    sites: MetaSiteDto[];
};
export type ConnectionDto = {
    id: string;
    "type": "immich" | "restic";
    name: string;
    createdAt: string;
    lastSeenAt?: string | null;
    repositoryCount: number;
};
export type ConnectionListResponseDto = {
    connections: ConnectionDto[];
};
export type ConnectionCreateRequestDto = {
    "type": "immich" | "restic";
    name: string;
};
export type ConnectionResponseDto = {
    connection: ConnectionDto;
};
export type ConnectionUpdateRequestDto = {
    name: string;
};
export type ConnectionAdoptRequestDto = {
    /** Repositories to move from the default connection to this one */
    repositoryIds: string[];
};
export type SubmitBackupEndRequestDto = {
    success: boolean;
    durationMs: number;
};
export type SubmitUpdateSizeRequestDto = {
    sizeBytes: number;
};
export type SubmitStructuredLogRequestDto = {
    summary: string;
    data: object;
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
    /** Internal site code from /meta; defaults to default_site */
    site?: string;
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
    /** Stable internal site code the repository lives in */
    siteCode: string | null;
    /** Stable, globally unique internal storage cluster code */
    storageClusterCode: string | null;
    connectionId: string;
    connectionType: string;
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
export function oidcAuthorize(codeChallenge: string, state: string, { inviteCode }: {
    inviteCode?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/oidc/login${QS.query(QS.explode({
        code_challenge: codeChallenge,
        state,
        invite_code: inviteCode
    }))}`, {
        ...opts
    }));
}
export function oidcCallback(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/auth/oidc/callback", {
        ...opts
    }));
}
export function oidcDeviceFlow({ connectionType, connectionName }: {
    connectionType?: string;
    connectionName?: string;
} = {}, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/oidc/device${QS.query(QS.explode({
        connection_type: connectionType,
        connection_name: connectionName
    }))}`, {
        ...opts
    }));
}
export function getMeta(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: MetaResponseDto;
    }>("/api/meta", {
        ...opts
    }));
}
export function listConnections(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ConnectionListResponseDto;
    }>("/api/connections", {
        ...opts
    }));
}
export function createConnection(connectionCreateRequestDto: ConnectionCreateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: ConnectionResponseDto;
    }>("/api/connections", oazapfts.json({
        ...opts,
        method: "POST",
        body: connectionCreateRequestDto
    })));
}
export function updateConnection(id: string, connectionUpdateRequestDto: ConnectionUpdateRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/connections/${encodeURIComponent(id)}`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: connectionUpdateRequestDto
    })));
}
export function deleteConnection(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/connections/${encodeURIComponent(id)}`, {
        ...opts,
        method: "DELETE"
    }));
}
export function adoptRepositories(id: string, connectionAdoptRequestDto: ConnectionAdoptRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/connections/${encodeURIComponent(id)}/adopt`, oazapfts.json({
        ...opts,
        method: "POST",
        body: connectionAdoptRequestDto
    })));
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
export function submitStructuredLog(submitStructuredLogRequestDto: SubmitStructuredLogRequestDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/api/metrics/submit/log", oazapfts.json({
        ...opts,
        method: "POST",
        body: submitStructuredLogRequestDto
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
