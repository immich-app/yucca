package config

import (
	"strings"
	"testing"
	"time"
)

func testDefaultCluster() ClusterConfig {
	return ClusterConfig{
		Code:                "default",
		S3AccessKeyID:       "default-key",
		S3SecretAccessKey:   "default-secret",
		S3Region:            "us-east-1",
		S3Endpoint:          "https://s3.default.example",
		S3ForcePathStyle:    true,
		S3BackendSource:     "dns",
		S3BackendDNSHost:    "rgw.default.svc",
		S3BackendPinHost:    true,
		S3TLSSkipVerify:     true,
		S3ProbeBucket:       "michael-probe",
		S3EjectThreshold:    3,
		S3ReconcileInterval: 5 * time.Second,
	}
}

func testEnv(vars map[string]string) func(string) string {
	return func(k string) string { return vars[k] }
}

func TestParseClustersFull(t *testing.T) {
	doc := `{
	  "clusters": [
	    {
	      "code": "spice",
	      "endpoint": "https://s3.spice.example:8443",
	      "region": "spice-1",
	      "force_path_style": false,
	      "access_key_env": "SPICE_KEY",
	      "secret_key_env": "SPICE_SECRET",
	      "backend_source": "file",
	      "backend_file": "/etc/michael/spice-backends",
	      "pin_host": false,
	      "tls_skip_verify": false,
	      "probe_bucket": "spice-probe",
	      "eject_threshold": 5,
	      "reconcile_interval_ms": 250
	    }
	  ]
	}`

	got, err := ParseClusters([]byte(doc), testDefaultCluster(), testEnv(map[string]string{
		"SPICE_KEY":    "spice-key",
		"SPICE_SECRET": "spice-secret",
	}))
	if err != nil {
		t.Fatalf("ParseClusters: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("expected 1 cluster, got %d", len(got))
	}

	want := ClusterConfig{
		Code:                "spice",
		S3AccessKeyID:       "spice-key",
		S3SecretAccessKey:   "spice-secret",
		S3Region:            "spice-1",
		S3Endpoint:          "https://s3.spice.example:8443",
		S3ForcePathStyle:    false,
		S3BackendSource:     "file",
		S3BackendFile:       "/etc/michael/spice-backends",
		S3BackendScheme:     "https",
		S3BackendPort:       "8443",
		S3BackendPinHost:    false,
		S3TLSSkipVerify:     false,
		S3ProbeBucket:       "spice-probe",
		S3EjectThreshold:    5,
		S3ReconcileInterval: 250 * time.Millisecond,
	}
	if got[0] != want {
		t.Errorf("cluster mismatch:\n got %+v\nwant %+v", got[0], want)
	}
}

// Unset knobs inherit the default cluster EXCEPT the backend source —
// inheriting it would serve repositories from the wrong Ceph.
func TestParseClustersInheritsDefaults(t *testing.T) {
	doc := `{"clusters":[{"code":"spice","endpoint":"http://s3.spice.example","access_key_env":"K","secret_key_env":"S"}]}`

	got, err := ParseClusters([]byte(doc), testDefaultCluster(), testEnv(map[string]string{"K": "k", "S": "s"}))
	if err != nil {
		t.Fatalf("ParseClusters: %v", err)
	}
	c := got[0]

	if c.S3Region != "us-east-1" || !c.S3ForcePathStyle || !c.S3TLSSkipVerify || !c.S3BackendPinHost {
		t.Errorf("expected the default cluster's knobs to be inherited, got %+v", c)
	}
	if c.S3ProbeBucket != "michael-probe" || c.S3EjectThreshold != 3 || c.S3ReconcileInterval != 5*time.Second {
		t.Errorf("expected the default pool tunables to be inherited, got %+v", c)
	}
	if c.S3BackendSource != "" || c.S3BackendDNSHost != "" || c.S3BackendFile != "" {
		t.Errorf("backend source must not be inherited from the default cluster, got %+v", c)
	}
	if c.S3BackendScheme != "http" || c.S3BackendPort != "80" {
		t.Errorf("expected scheme/port derived from this cluster's own endpoint, got %s/%s", c.S3BackendScheme, c.S3BackendPort)
	}
}

func TestParseClustersErrors(t *testing.T) {
	env := testEnv(map[string]string{"K": "k", "S": "s", "EMPTY": ""})

	cases := []struct {
		name, doc, wantErr string
	}{
		{
			name:    "duplicate code",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"S"},{"code":"spice","endpoint":"http://b","access_key_env":"K","secret_key_env":"S"}]}`,
			wantErr: "duplicate cluster code",
		},
		{
			name:    "collides with default code",
			doc:     `{"clusters":[{"code":"default","endpoint":"http://a","access_key_env":"K","secret_key_env":"S"}]}`,
			wantErr: "duplicate cluster code",
		},
		{
			name:    "invalid code",
			doc:     `{"clusters":[{"code":"Spice_1","endpoint":"http://a","access_key_env":"K","secret_key_env":"S"}]}`,
			wantErr: "must match",
		},
		{
			name:    "missing code",
			doc:     `{"clusters":[{"endpoint":"http://a","access_key_env":"K","secret_key_env":"S"}]}`,
			wantErr: "must match",
		},
		{
			name:    "missing endpoint",
			doc:     `{"clusters":[{"code":"spice","access_key_env":"K","secret_key_env":"S"}]}`,
			wantErr: "endpoint is required",
		},
		{
			name:    "missing credential env names",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a"}]}`,
			wantErr: "access_key_env and secret_key_env are required",
		},
		{
			name:    "credential env unset",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"MISSING","secret_key_env":"S"}]}`,
			wantErr: "MISSING is unset or empty",
		},
		{
			name:    "credential env empty",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"EMPTY"}]}`,
			wantErr: "EMPTY is unset or empty",
		},
		{
			name:    "unknown backend source",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"S","backend_source":"consul"}]}`,
			wantErr: "backend_source must be",
		},
		{
			name:    "file source without file",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"S","backend_source":"file"}]}`,
			wantErr: "backend_file is required",
		},
		{
			name:    "dns source without host",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"S","backend_source":"dns"}]}`,
			wantErr: "backend_dns_host is required",
		},
		{
			name:    "unknown field",
			doc:     `{"clusters":[{"code":"spice","endpoint":"http://a","access_key_env":"K","secret_key_env":"S","secret_key":"oops"}]}`,
			wantErr: "unknown field",
		},
		{
			name:    "malformed json",
			doc:     `{"clusters":[`,
			wantErr: "decode clusters",
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := ParseClusters([]byte(c.doc), testDefaultCluster(), env)
			if err == nil {
				t.Fatal("expected an error")
			}
			if !strings.Contains(err.Error(), c.wantErr) {
				t.Errorf("error %q does not mention %q", err, c.wantErr)
			}
		})
	}
}

func TestParseClustersEmptyDocument(t *testing.T) {
	got, err := ParseClusters([]byte(`{"clusters":[]}`), testDefaultCluster(), testEnv(nil))
	if err != nil {
		t.Fatalf("ParseClusters: %v", err)
	}
	if len(got) != 0 {
		t.Fatalf("expected no clusters, got %d", len(got))
	}
}

func TestParseTopologyClusters(t *testing.T) {
	def := testDefaultCluster()
	def.Code = "father-spice"
	doc := `{
	  "schema_version": 1,
	  "default_site": "father",
	  "sites": [{
	    "code": "father",
	    "display_name": "Falkenstein",
	    "description": "Germany",
	    "rest_url": "https://rest.example",
	    "default_cluster": "father-spice",
	    "clusters": [
	      {
	        "code": "father-spice",
	        "display_name": "Spice",
	        "active": true,
	        "rgw_admin_endpoint": "https://admin.spice.example",
	        "s3": {
	          "endpoint": "https://s3.spice.example",
	          "access_key_env": "SPICE_KEY",
	          "secret_key_env": "SPICE_SECRET",
	          "backend_source": "dns",
	          "backend_dns_host": "rgw.spice.example"
	        }
	      },
	      {
	        "code": "father-pepper",
	        "display_name": "Pepper",
	        "active": false,
	        "s3": {
	          "endpoint": "https://s3.pepper.example",
	          "access_key_env": "PEPPER_KEY",
	          "secret_key_env": "PEPPER_SECRET"
	        }
	      }
	    ]
	  }]
	}`
	got, err := ParseTopologyClusters([]byte(doc), "father", def, testEnv(map[string]string{
		"SPICE_KEY":     "spice-key",
		"SPICE_SECRET":  "spice-secret",
		"PEPPER_KEY":    "pepper-key",
		"PEPPER_SECRET": "pepper-secret",
	}))
	if err != nil {
		t.Fatalf("ParseTopologyClusters: %v", err)
	}
	if len(got) != 2 || got[0].Code != "father-spice" || got[1].Code != "father-pepper" {
		t.Fatalf("unexpected topology clusters: %+v", got)
	}
	if got[1].S3AccessKeyID != "pepper-key" || got[1].S3Endpoint != "https://s3.pepper.example" {
		t.Fatalf("additional cluster configuration was not resolved: %+v", got[1])
	}
}

func TestParseTopologyClustersRejectsMismatch(t *testing.T) {
	def := testDefaultCluster()
	def.Code = "father-spice"
	doc := `{"schema_version":1,"default_site":"father","sites":[{
	  "code":"father","display_name":"Father","description":"","rest_url":"https://rest.example",
	  "default_cluster":"father-pepper","clusters":[]
	}]}`
	_, err := ParseTopologyClusters([]byte(doc), "father", def, testEnv(nil))
	if err == nil || !strings.Contains(err.Error(), "does not match S3_DEFAULT_CLUSTER") {
		t.Fatalf("expected default cluster mismatch, got %v", err)
	}
}

func TestDefaultClusterFromFlatConfig(t *testing.T) {
	cfg := Config{
		S3AccessKeyID:       "key",
		S3SecretAccessKey:   "secret",
		S3Region:            "us-east-1",
		S3Endpoint:          "https://s3.example",
		S3ForcePathStyle:    true,
		S3BackendSource:     "dns",
		S3BackendDNSHost:    "rgw.example",
		S3BackendScheme:     "https",
		S3BackendPort:       "443",
		S3BackendPinHost:    true,
		S3TLSSkipVerify:     true,
		S3ProbeBucket:       "probe",
		S3EjectThreshold:    3,
		S3ReconcileInterval: time.Second,
		S3DefaultCluster:    "sietch",
	}

	got := cfg.DefaultCluster()
	if got.Code != "sietch" {
		t.Errorf("expected code sietch, got %q", got.Code)
	}
	if got.S3Endpoint != cfg.S3Endpoint || got.S3AccessKeyID != cfg.S3AccessKeyID || got.S3BackendDNSHost != cfg.S3BackendDNSHost {
		t.Errorf("flat S3_* config not carried into the default cluster: %+v", got)
	}
}
