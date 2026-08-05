package cli

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"text/tabwriter"

	"github.com/spf13/cobra"

	"yuctl/internal/adminapi"
	"yuctl/internal/op"
	"yuctl/internal/rgw"
	"yuctl/internal/state"
)

func newReposCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "repos",
		Short: "Repository administration via yucca-admin-api",
	}
	cmd.AddCommand(newReposMigrateStorageCredentialsCmd(), newReposOrphansCmd(), newReposPurgeCmd())
	return cmd
}

func newReposMigrateStorageCredentialsCmd() *cobra.Command {
	flags := &adminFlags{}
	var (
		dryRun      bool
		rotate      bool
		repoID      string
		rgwEndpoint string
		region      string
	)

	c := &cobra.Command{
		Use:   "migrate-storage-credentials",
		Short: "Give each repository its own RGW user and hand its bucket over",
		Long: "Provisions every repository's own S3 user through admin-api, marks its bucket\n" +
			"BucketOwnerEnforced (signed as the current owner, so existing objects follow the\n" +
			"bucket), then links the bucket to the new user. Idempotent: a repository that is\n" +
			"already migrated is reported and skipped.",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}

			cluster, err := selectedCephCluster(ctx)
			if err != nil {
				return err
			}
			endpoint := rgwEndpoint
			if endpoint == "" {
				endpoint = cluster.RGWS3Endpoint
			}
			if endpoint == "" {
				return fmt.Errorf("no rgw_s3_endpoint in discovery for the selected ceph cluster; pass --rgw-endpoint")
			}

			admin, err := resolveCredentials(ctx, cluster.S3MigratorCredRefs, "s3_migrator_cred_refs")
			if err != nil {
				return err
			}
			owner, err := resolveCredentials(ctx, cluster.S3OwnerCredRefs, "s3_owner_cred_refs")
			if err != nil {
				return err
			}

			repositories, err := listMigrationTargets(ctx, client, repoID)
			if err != nil {
				return err
			}

			rgwAdmin := rgw.NewAdminClient(endpoint, region, admin, flags.insecure)
			out := cmd.OutOrStdout()
			var migrated, skipped, failed int

			for _, repository := range repositories {
				status, err := migrateOne(ctx, migration{
					client:   client,
					rgw:      rgwAdmin,
					endpoint: endpoint,
					region:   region,
					owner:    owner,
					insecure: flags.insecure,
					dryRun:   dryRun,
					rotate:   rotate,
				}, repository)
				switch {
				case err != nil:
					failed++
					fmt.Fprintf(out, "%s  FAILED  %s\n", repository.ID, err)
				case status == statusSkipped:
					skipped++
					fmt.Fprintf(out, "%s  ok      already owned by its repository user\n", repository.ID)
				default:
					migrated++
					fmt.Fprintf(out, "%s  %s\n", repository.ID, status)
				}
			}

			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d migrated, %d already done, %d failed (of %d)\n",
				migrated, skipped, failed, len(repositories))
			if failed > 0 {
				return fmt.Errorf("%d repositories could not be migrated", failed)
			}
			return nil
		},
	}

	flags.register(c)
	c.Flags().BoolVar(&dryRun, "dry-run", false, "report what would change without provisioning or linking anything")
	c.Flags().BoolVar(&rotate, "rotate", false, "issue fresh keys even for repositories that already have some")
	c.Flags().StringVar(&repoID, "repository", "", "migrate a single repository by id")
	registerRGWFlags(c, &rgwEndpoint, &region)
	return c
}

type migrationStatus string

const (
	statusSkipped   migrationStatus = "skipped"
	statusMigrated  migrationStatus = "migrated"
	statusWouldMove migrationStatus = "would migrate"
)

type migration struct {
	client   *adminapi.Client
	rgw      *rgw.AdminClient
	endpoint string
	region   string
	owner    rgw.Credentials
	insecure bool
	dryRun   bool
	rotate   bool
}

// Ownership is enforced before the link, or the new owner inherits a bucket
// full of objects it cannot read.
func migrateOne(ctx context.Context, m migration, repository adminapi.Repository) (migrationStatus, error) {
	bucket, err := m.rgw.GetBucket(ctx, repository.ID)
	if err != nil {
		return "", fmt.Errorf("read bucket: %w", err)
	}

	credentials, err := m.provision(ctx, repository.ID)
	if err != nil {
		return "", err
	}

	if bucket.Owner == credentials.StorageUserID && !m.rotate {
		return statusSkipped, nil
	}
	if m.dryRun {
		return statusWouldMove, nil
	}

	if bucket.Owner != credentials.StorageUserID {
		if err := rgw.EnforceBucketOwner(ctx, m.endpoint, m.region, m.owner, repository.ID, m.insecure); err != nil {
			return "", err
		}
		if err := m.rgw.LinkBucket(ctx, repository.ID, bucket.ID, credentials.StorageUserID); err != nil {
			return "", fmt.Errorf("link bucket to %s: %w", credentials.StorageUserID, err)
		}

		// A silently no-op link would leave the repository unreadable with its
		// new credentials.
		after, err := m.rgw.GetBucket(ctx, repository.ID)
		if err != nil {
			return "", fmt.Errorf("verify bucket owner: %w", err)
		}
		if after.Owner != credentials.StorageUserID {
			return "", fmt.Errorf("bucket owner is still %q after link, expected %q", after.Owner, credentials.StorageUserID)
		}
	}

	return statusMigrated, nil
}

// Mirrors storageUserId() in the APIs: a dry run must not provision anything,
// so it is the one path that derives the name instead of being told it.
const storageUserPrefix = "yucca-repo-"

func (m migration) provision(ctx context.Context, id string) (*adminapi.StorageCredentials, error) {
	if m.dryRun {
		return &adminapi.StorageCredentials{StorageUserID: storageUserPrefix + id}, nil
	}
	credentials, err := m.client.ProvisionStorageCredentials(ctx, id, m.rotate)
	if err != nil {
		return nil, fmt.Errorf("provision storage credentials: %w", err)
	}
	return credentials, nil
}

func listMigrationTargets(ctx context.Context, client *adminapi.Client, repoID string) ([]adminapi.Repository, error) {
	if repoID != "" {
		return []adminapi.Repository{{ID: repoID}}, nil
	}
	return client.ListRepositories(ctx, "", 0)
}

func selectedCephCluster(ctx context.Context) (state.CephCluster, error) {
	c, err := requireContext()
	if err != nil {
		return state.CephCluster{}, err
	}
	if c.CephCluster == "" {
		return state.CephCluster{}, fmt.Errorf("no ceph cluster selected; run `yuctl ceph select <name>` first")
	}
	topo, err := resolveTopology(ctx)
	if err != nil {
		return state.CephCluster{}, err
	}
	clusters := topo.CephClusters(c.Partition, c.Region)
	cluster, ok := clusters[c.CephCluster]
	if !ok {
		return state.CephCluster{}, fmt.Errorf("ceph cluster %q no longer present in %s@%s", c.CephCluster, c.Partition, c.Region)
	}
	return cluster, nil
}

// resolveCredentials reads an {access_key, secret_key} pair of op:// references
// out of a discovery payload.
func resolveCredentials(ctx context.Context, refs map[string]string, field string) (rgw.Credentials, error) {
	access, secret := refs["access_key"], refs["secret_key"]
	if access == "" || secret == "" {
		return rgw.Credentials{}, fmt.Errorf("ceph discovery has no %s.{access_key,secret_key}", field)
	}
	accessKey, err := op.Read(ctx, access)
	if err != nil {
		return rgw.Credentials{}, fmt.Errorf("resolve %s.access_key: %w", field, err)
	}
	secretKey, err := op.Read(ctx, secret)
	if err != nil {
		return rgw.Credentials{}, fmt.Errorf("resolve %s.secret_key: %w", field, err)
	}
	return rgw.Credentials{
		AccessKeyID:     strings.TrimSpace(accessKey),
		SecretAccessKey: strings.TrimSpace(secretKey),
	}, nil
}

// A bucket whose name is a repository id but which no repository row claims:
// deleting a repository has never deleted its data, so these accumulate and are
// otherwise only visible as a metrics-worker log line.
type orphan struct {
	bucket  rgw.Bucket
	userUID string
}

func findOrphans(ctx context.Context, client *adminapi.Client, admin *rgw.AdminClient) ([]orphan, error) {
	repositories, err := client.ListRepositories(ctx, "", 0)
	if err != nil {
		return nil, err
	}
	live := make(map[string]struct{}, len(repositories))
	for _, r := range repositories {
		live[r.ID] = struct{}{}
	}

	buckets, err := admin.ListBuckets(ctx)
	if err != nil {
		return nil, fmt.Errorf("list buckets: %w", err)
	}

	var out []orphan
	for _, b := range buckets {
		if _, ok := live[b.Bucket]; ok {
			continue
		}
		if !strings.HasPrefix(b.Owner, storageUserPrefix) {
			continue
		}
		out = append(out, orphan{bucket: b, userUID: b.Owner})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].bucket.Bucket < out[j].bucket.Bucket })
	return out, nil
}

func newReposOrphansCmd() *cobra.Command {
	flags := &adminFlags{}
	var rgwEndpoint, region string

	c := &cobra.Command{
		Use:   "orphans",
		Short: "List repository buckets that no repository row claims",
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			admin, endpoint, err := migratorClient(ctx, rgwEndpoint, region, flags.insecure)
			if err != nil {
				return err
			}
			_ = endpoint

			orphans, err := findOrphans(ctx, client, admin)
			if err != nil {
				return err
			}

			w := tabwriter.NewWriter(cmd.OutOrStdout(), 0, 2, 2, ' ', 0)
			fmt.Fprintln(w, "BUCKET\tOWNER\tOBJECTS\tBYTES")
			var bytes int64
			for _, o := range orphans {
				fmt.Fprintf(w, "%s\t%s\t%d\t%d\n", o.bucket.Bucket, o.userUID, o.bucket.Objects(), o.bucket.Bytes())
				bytes += o.bucket.Bytes()
			}
			w.Flush()
			fmt.Fprintf(cmd.ErrOrStderr(), "\n%d orphaned bucket(s), %d bytes. Reclaim one with `yuctl repos purge <id>`.\n",
				len(orphans), bytes)
			return nil
		},
	}
	flags.register(c)
	registerRGWFlags(c, &rgwEndpoint, &region)
	return c
}

func newReposPurgeCmd() *cobra.Command {
	flags := &adminFlags{}
	var rgwEndpoint, region string
	var yes bool

	c := &cobra.Command{
		Use:   "purge <repository-id>",
		Short: "Delete an orphaned repository bucket, its objects and its RGW user",
		Long: "Destroys data. Refuses unless the repository is genuinely gone from the\n" +
			"database and its bucket is owned by the matching " + storageUserPrefix + "* user.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			ctx := cmd.Context()
			id := args[0]

			client, _, err := flags.allowlistClient(cmd)
			if err != nil {
				return err
			}
			admin, endpoint, err := migratorClient(ctx, rgwEndpoint, region, flags.insecure)
			if err != nil {
				return err
			}

			orphans, err := findOrphans(ctx, client, admin)
			if err != nil {
				return err
			}
			var target *orphan
			for i := range orphans {
				if orphans[i].bucket.Bucket == id {
					target = &orphans[i]
					break
				}
			}
			if target == nil {
				return fmt.Errorf("%s is not an orphaned bucket; `yuctl repos orphans` lists what can be purged", id)
			}

			if !yes {
				fmt.Fprintf(cmd.ErrOrStderr(),
					"About to DELETE bucket %s (%d objects, %d bytes) and user %s. Re-run with --yes.\n",
					id, target.bucket.Objects(), target.bucket.Bytes(), target.userUID)
				return fmt.Errorf("refusing to purge without --yes")
			}

			if err := admin.RemoveBucket(ctx, id, true); err != nil {
				return fmt.Errorf("remove bucket: %w", err)
			}
			// The user is a separate credential's job: the migrator is bucket-only.
			provisioner, err := provisionerClient(ctx, endpoint, region, flags.insecure)
			if err != nil {
				return err
			}
			if err := provisioner.RemoveUser(ctx, target.userUID); err != nil {
				return fmt.Errorf("remove user %s: %w", target.userUID, err)
			}

			fmt.Fprintf(cmd.OutOrStdout(), "%s  purged (bucket, objects and %s)\n", id, target.userUID)
			return nil
		},
	}
	flags.register(c)
	registerRGWFlags(c, &rgwEndpoint, &region)
	c.Flags().BoolVar(&yes, "yes", false, "confirm the deletion")
	return c
}

func registerRGWFlags(c *cobra.Command, endpoint, region *string) {
	c.Flags().StringVar(endpoint, "rgw-endpoint", "", "RGW S3 endpoint (default: the selected ceph cluster's rgw_s3_endpoint)")
	c.Flags().StringVar(region, "region", "us-east-1", "S3 region to sign with")
}

func migratorClient(ctx context.Context, rgwEndpoint, region string, insecure bool) (*rgw.AdminClient, string, error) {
	cluster, err := selectedCephCluster(ctx)
	if err != nil {
		return nil, "", err
	}
	endpoint := rgwEndpoint
	if endpoint == "" {
		endpoint = cluster.RGWS3Endpoint
	}
	if endpoint == "" {
		return nil, "", fmt.Errorf("no rgw_s3_endpoint in discovery for the selected ceph cluster; pass --rgw-endpoint")
	}
	creds, err := resolveCredentials(ctx, cluster.S3MigratorCredRefs, "s3_migrator_cred_refs")
	if err != nil {
		return nil, "", err
	}
	return rgw.NewAdminClient(endpoint, region, creds, insecure), endpoint, nil
}

func provisionerClient(ctx context.Context, endpoint, region string, insecure bool) (*rgw.AdminClient, error) {
	cluster, err := selectedCephCluster(ctx)
	if err != nil {
		return nil, err
	}
	creds, err := resolveCredentials(ctx, cluster.S3ProvisionerCredRefs, "s3_provisioner_cred_refs")
	if err != nil {
		return nil, err
	}
	return rgw.NewAdminClient(endpoint, region, creds, insecure), nil
}
