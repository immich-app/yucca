import { readFileSync } from 'node:fs';
import { z } from 'zod';

// GitOps-owned fleet topology: each site runs one michael (rest_url) fronting
// one-or-more ceph storage clusters. The file is rendered per environment
// (Flux ConfigMap in real clusters, a checked-in file for dev) and validated
// here at boot.

const codeSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/, 'Codes must be lowercase alphanumeric/dashes');
const envNameSchema = z.string().regex(/^[A-Z_][A-Z0-9_]*$/, 'Environment variable names must be uppercase');

const storageClusterSchema = z
  .object({
    code: codeSchema,
    display_name: z.string().min(1),
    active: z.boolean().default(false),
    rgw_admin_endpoint: z.url().optional(),
    s3: z
      .object({
        endpoint: z.url(),
        region: z.string().min(1).default('us-east-1'),
        force_path_style: z.boolean().default(true),
        access_key_env: envNameSchema,
        secret_key_env: envNameSchema,
        backend_source: z.enum(['file', 'dns']).optional(),
        backend_file: z.string().min(1).optional(),
        backend_dns_host: z.string().min(1).optional(),
        backend_scheme: z.enum(['http', 'https']).optional(),
        backend_port: z.string().regex(/^\d+$/).optional(),
        pin_host: z.boolean().optional(),
        tls_skip_verify: z.boolean().optional(),
        probe_bucket: z.string().min(1).optional(),
        eject_threshold: z.number().int().min(1).optional(),
        reconcile_interval_ms: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const siteSchema = z
  .object({
    code: codeSchema,
    display_name: z.string().min(1),
    description: z.string().default(''),
    rest_url: z.url(),
    default_cluster: codeSchema,
    clusters: z.array(storageClusterSchema).min(1),
  })
  .strict();

export const topologySchema = z
  .strictObject({
    schema_version: z.literal(1),
    default_site: codeSchema,
    sites: z.array(siteSchema).min(1),
  })
  .superRefine((topology, ctx) => {
    const siteCodes = new Set<string>();
    const fleetClusterCodes = new Set<string>();
    for (const site of topology.sites) {
      if (siteCodes.has(site.code)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate site code '${site.code}'` });
      }
      siteCodes.add(site.code);

      const clusterCodes = new Set<string>();
      for (const cluster of site.clusters) {
        if (clusterCodes.has(cluster.code)) {
          ctx.addIssue({ code: 'custom', message: `Duplicate cluster code '${cluster.code}' in site '${site.code}'` });
        }
        if (fleetClusterCodes.has(cluster.code)) {
          ctx.addIssue({ code: 'custom', message: `Duplicate fleet cluster code '${cluster.code}'` });
        }
        if (!cluster.code.startsWith(`${site.code}-`)) {
          ctx.addIssue({
            code: 'custom',
            message: `Cluster code '${cluster.code}' must start with its site code '${site.code}-'`,
          });
        }
        clusterCodes.add(cluster.code);
        fleetClusterCodes.add(cluster.code);

        if (cluster.s3?.backend_source === 'file' && !cluster.s3.backend_file) {
          ctx.addIssue({
            code: 'custom',
            message: `Cluster '${cluster.code}' requires s3.backend_file when backend_source is 'file'`,
          });
        }
        if (cluster.s3?.backend_source === 'dns' && !cluster.s3.backend_dns_host) {
          ctx.addIssue({
            code: 'custom',
            message: `Cluster '${cluster.code}' requires s3.backend_dns_host when backend_source is 'dns'`,
          });
        }
      }

      if (!clusterCodes.has(site.default_cluster)) {
        ctx.addIssue({
          code: 'custom',
          message: `Site '${site.code}' default_cluster '${site.default_cluster}' is not one of its clusters`,
        });
      }

      const activeCount = site.clusters.filter((cluster) => cluster.active).length;
      if (activeCount !== 1) {
        ctx.addIssue({
          code: 'custom',
          message: `Site '${site.code}' must have exactly one active cluster, found ${activeCount}`,
        });
      }
    }

    if (!siteCodes.has(topology.default_site)) {
      ctx.addIssue({ code: 'custom', message: `default_site '${topology.default_site}' is not a declared site` });
    }
  });

export type Topology = z.infer<typeof topologySchema>;
export type TopologySite = Topology['sites'][number];
export type TopologyStorageCluster = TopologySite['clusters'][number];

export const parseTopology = (input: unknown): Topology => topologySchema.parse(input);

export const readTopology = (path: string): { source: string; topology: Topology } => {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read topology file '${path}': ${error instanceof Error ? error.message : error}`);
  }

  try {
    return { source: raw, topology: parseTopology(JSON.parse(raw)) };
  } catch (error) {
    throw new Error(`Invalid topology file '${path}': ${error instanceof Error ? error.message : error}`);
  }
};

export const loadTopology = (path: string): Topology => readTopology(path).topology;
