package cli

import (
	"context"
	"fmt"
	"strings"

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
	cmd.AddCommand(newReposMigrateStorageCredentialsCmd())
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
		insecure    bool
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

			rgwAdmin := rgw.NewAdminClient(endpoint, region, admin, insecure)
			out := cmd.OutOrStdout()
			var migrated, skipped, failed int

			for _, repository := range repositories {
				status, err := migrateOne(ctx, migration{
					client:   client,
					rgw:      rgwAdmin,
					endpoint: endpoint,
					region:   region,
					owner:    owner,
					insecure: insecure,
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
	c.Flags().StringVar(&rgwEndpoint, "rgw-endpoint", "", "RGW S3 endpoint (default: the selected ceph cluster's rgw_s3_endpoint)")
	c.Flags().StringVar(&region, "region", "us-east-1", "S3 region to sign with")
	c.Flags().BoolVar(&insecure, "insecure-skip-tls-verify", false, "skip TLS verification (self-signed RGW certs)")
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
