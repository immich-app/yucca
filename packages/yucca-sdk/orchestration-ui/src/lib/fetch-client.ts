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
export type RepositoryMetricsDto = {
    lastUpload?: string;
    sizeBytes: number;
};
export type Boolean = {};
export type RepositoryMetadataDto = {
    paths: string[];
};
export type LocalRepositoryDto = {
    id: string;
    worm: boolean;
    metrics: RepositoryMetricsDto;
    local?: Boolean | RepositoryMetadataDto;
};
export type RepositoryCreateResponseDto = {
    repository: LocalRepositoryDto;
};
export type RepositoryListResponseDto = {
    repositories: LocalRepositoryDto[];
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
export type LogsDto = {
    runs: string[];
};
export type LogDto = {
    log: string;
};
export function createRepository(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResponseDto;
    }>("/api/repository", {
        ...opts,
        method: "POST"
    }));
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
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/${encodeURIComponent(id)}`, {
        ...opts,
        method: "POST"
    }));
}
export function setRepositoryConfig(id: string, repositoryMetadataDto: RepositoryMetadataDto, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/repository/${encodeURIComponent(id)}`, oazapfts.json({
        ...opts,
        method: "PATCH",
        body: repositoryMetadataDto
    })));
}
export function getFileListing(path: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: FilesystemListingResponseDto;
    }>(`/api/fs${QS.query(QS.explode({
        path
    }))}`, {
        ...opts
    }));
}
export function login(next: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/login${QS.query(QS.explode({
        next
    }))}`, {
        ...opts
    }));
}
export function callback(code: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: object;
    }>(`/api/auth/callback${QS.query(QS.explode({
        code
    }))}`, {
        ...opts
    }));
}
export function listRuns(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogsDto;
    }>(`/api/draft/${encodeURIComponent(id)}`, {
        ...opts
    }));
}
export function getRun(id: string, run: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: LogDto;
    }>(`/api/draft/${encodeURIComponent(id)}/${encodeURIComponent(run)}`, {
        ...opts
    }));
}
