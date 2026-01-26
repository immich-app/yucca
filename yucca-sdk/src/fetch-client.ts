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
    baseUrl: "/api"
};
const oazapfts = Oazapfts.runtime(defaults);
export const servers = {
    server1: "/api"
};
export type OidcAuthorizeDto = {
    redirectTo: string;
};
export function hello(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/", {
        ...opts
    }));
}
export function protectedRoute(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/protected-route", {
        ...opts
    }));
}
export function oidcAuthorize(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchJson<{
        status: 200;
        data: OidcAuthorizeDto;
    }>("/auth/oidc/login", {
        ...opts
    }));
}
export function oidcCallback(opts?: Oazapfts.RequestOpts) {
    return oazapfts.ok(oazapfts.fetchText("/auth/oidc/callback", {
        ...opts
    }));
}
