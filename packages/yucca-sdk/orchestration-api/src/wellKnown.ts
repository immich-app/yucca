import { z } from 'zod';
import { YUCCA_WELL_KNOWN } from './const';
import { evaluateConnectionsMath } from './utils/connectionsMath';

const metaConfigSchema = z
  .object({
    restic_pack_size_mib: z.number().int().min(1).max(128).optional(),
    connections_math: z.string().optional(),
  })
  .strict();

const metaClusterSchema = z
  .object({
    code: z.string().min(1),
    display_name: z.string().min(1),
    cluster_config: metaConfigSchema,
  })
  .strict();

const metaSiteSchema = z
  .object({
    code: z.string().min(1),
    display_name: z.string().min(1),
    description: z.string(),
    rest_url: z.url(),
    default_cluster: z.string().min(1),
    site_config: metaConfigSchema,
    clusters: z.array(metaClusterSchema).min(1),
  })
  .strict();

const metaSchema = z
  .object({
    api_root: z.url(),
    config: metaConfigSchema,
    default_site: z.string().min(1),
    sites: z.array(metaSiteSchema).min(1),
  })
  .strict()
  .superRefine((meta, ctx) => {
    if (!meta.sites.some((site) => site.code === meta.default_site)) {
      ctx.addIssue({ code: 'custom', message: `default_site '${meta.default_site}' is not declared` });
    }
    for (const site of meta.sites) {
      if (!site.clusters.some((cluster) => cluster.code === site.default_cluster)) {
        ctx.addIssue({
          code: 'custom',
          message: `Site '${site.code}' default_cluster '${site.default_cluster}' is not declared`,
        });
      }
    }
  });

const pointerSchema = z.object({ meta_url: z.url() }).strict();

export type MetaConfig = z.infer<typeof metaConfigSchema>;
export type MetaCluster = z.infer<typeof metaClusterSchema>;
export type MetaSite = z.infer<typeof metaSiteSchema>;
export type Meta = z.infer<typeof metaSchema>;

const META_CACHE_TTL = 5 * 60 * 1000;
const FAILURE_CACHE_TTL = 60 * 1000;
const FETCH_TIMEOUT = 8000;

class UnknownTopologyCodeError extends Error {}

const fetchValidated = async <T>(url: string, schema: z.ZodType<T>): Promise<T> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
  if (!response.ok) {
    throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  }
  return schema.parse(await response.json());
};

export class YuccaWellKnown {
  private url = YUCCA_WELL_KNOWN;
  private data?: Meta;
  private fetchedAt = 0;
  private lastError?: unknown;
  private failedAt = 0;

  configure(url?: string) {
    this.url = url ?? YUCCA_WELL_KNOWN;
    this.data = undefined;
    this.fetchedAt = 0;
    this.lastError = undefined;
    this.failedAt = 0;
  }

  async get(): Promise<Meta> {
    const fresh = Date.now() - this.fetchedAt < META_CACHE_TTL;
    const failedRecently = this.lastError !== undefined && Date.now() - this.failedAt < FAILURE_CACHE_TTL;
    if (this.data && (fresh || failedRecently)) {
      return this.data;
    }
    if (!this.data && failedRecently) {
      throw this.lastError;
    }

    try {
      const pointer = await fetchValidated(this.url, pointerSchema);
      const next = await fetchValidated(pointer.meta_url, metaSchema);
      this.data = next;
      this.fetchedAt = Date.now();
      this.lastError = undefined;
      return next;
    } catch (error) {
      this.lastError = error;
      this.failedAt = Date.now();
      if (this.data) {
        return this.data;
      }
      throw error;
    }
  }

  // The api-client's operation paths already carry the /api prefix, so the
  // request base is api_root without it.
  async getBaseUrl(): Promise<string> {
    const meta = await this.get();
    return meta.api_root.replace(/\/api\/?$/, '');
  }

  async getSites(): Promise<MetaSite[]> {
    const meta = await this.get();
    return meta.sites;
  }

  async getConfig(siteCode?: string, clusterCode?: string): Promise<MetaConfig> {
    const meta = await this.get();
    if (!siteCode) {
      if (clusterCode) {
        throw new UnknownTopologyCodeError(`Cluster '${clusterCode}' was provided without a site`);
      }
      return { ...meta.config };
    }

    const site = meta.sites.find((candidate) => candidate.code === siteCode);
    if (!site) {
      throw new UnknownTopologyCodeError(`Unknown site '${siteCode}'`);
    }
    if (!clusterCode) {
      return { ...meta.config, ...site.site_config };
    }

    const cluster = site.clusters.find((candidate) => candidate.code === clusterCode);
    if (!cluster) {
      throw new UnknownTopologyCodeError(`Unknown cluster '${clusterCode}' for site '${siteCode}'`);
    }
    return { ...meta.config, ...site.site_config, ...cluster.cluster_config };
  }

  async getConnections(cores: number, siteCode?: string, clusterCode?: string): Promise<number | undefined> {
    try {
      const { connections_math } = await this.getConfig(siteCode, clusterCode);
      if (!connections_math) {
        return undefined;
      }
      return Math.max(1, Math.floor(evaluateConnectionsMath(connections_math, cores)));
    } catch (error) {
      if (error instanceof UnknownTopologyCodeError) {
        throw error;
      }
      return undefined;
    }
  }

  async getPackSizeMib(siteCode?: string, clusterCode?: string): Promise<number | undefined> {
    try {
      const config = await this.getConfig(siteCode, clusterCode);
      return config.restic_pack_size_mib;
    } catch (error) {
      if (error instanceof UnknownTopologyCodeError) {
        throw error;
      }
      return undefined;
    }
  }
}

export const yuccaWellKnown = new YuccaWellKnown();
