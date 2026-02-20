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
export type RepositoryMetricsDto = {
    lastUpload?: string;
    sizeBytes: number;
};
export type RepositoryWithMetricsDto = {
    id: string;
    worm: boolean;
    metrics: RepositoryMetricsDto;
};
export type RepositoryCreateResponseDto = {
    repository: RepositoryWithMetricsDto;
};
export type RepositoryListResponseDto = {
    repositories: RepositoryWithMetricsDto[];
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
export function oidcAuthorize(codeChallenge: string, redirectUri: string, state: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText(`/api/auth/oidc/login${QS.query(QS.explode({
        code_challenge: codeChallenge,
        redirect_uri: redirectUri,
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
export function createResticUrl(id: string, opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: RepositoryCreateResticUrlDto;
    }>(`/api/repository/${encodeURIComponent(id)}/restic`, {
        ...opts,
        method: "POST"
    }));
}
