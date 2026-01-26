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
export function hello(opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/", {
        ...opts
    });
}
export function oidcStart(opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/oidc/login", {
        ...opts
    });
}
export function oidcCallback(opts?: Oazapfts.RequestOpts) {
    return oazapfts.fetchText("/oidc/callback", {
        ...opts
    });
}
