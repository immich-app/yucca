package geoip

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
)

// testdata/asn-test.mmdb is a synthetic three-network ASN database over the
// documentation ranges, written with github.com/maxmind/mmdbwriter.
const testDB = "testdata/asn-test.mmdb"

func TestClientAddr(t *testing.T) {
	tests := []struct {
		name       string
		header     string
		values     []string
		remoteAddr string
		want       string
	}{
		{
			name:       "falls back to the transport peer with no header configured",
			remoteAddr: "203.0.113.7:44321",
			want:       "203.0.113.7",
		},
		{
			name:       "falls back to the transport peer when the header is absent",
			header:     "X-Forwarded-For",
			remoteAddr: "203.0.113.7:44321",
			want:       "203.0.113.7",
		},
		{
			name:       "takes the rightmost entry, not the client-supplied prefix",
			header:     "X-Forwarded-For",
			values:     []string{"9.9.9.9, 203.0.113.7"},
			remoteAddr: "10.0.0.1:1234",
			want:       "203.0.113.7",
		},
		{
			name:       "takes the rightmost entry across repeated headers",
			header:     "X-Forwarded-For",
			values:     []string{"9.9.9.9", "198.51.100.4"},
			remoteAddr: "10.0.0.1:1234",
			want:       "198.51.100.4",
		},
		{
			name:       "skips unparseable trailing entries",
			header:     "X-Forwarded-For",
			values:     []string{"203.0.113.7, unknown"},
			remoteAddr: "10.0.0.1:1234",
			want:       "203.0.113.7",
		},
		{
			name:       "accepts a bracketed IPv6 entry with a port",
			header:     "X-Forwarded-For",
			values:     []string{"[2001:db8::5]:9000"},
			remoteAddr: "10.0.0.1:1234",
			want:       "2001:db8::5",
		},
		{
			name:       "accepts a bare IPv6 entry",
			header:     "X-Forwarded-For",
			values:     []string{"2001:db8::5"},
			remoteAddr: "10.0.0.1:1234",
			want:       "2001:db8::5",
		},
		{
			name:       "unmaps IPv4-in-IPv6 so one client is one series",
			header:     "X-Forwarded-For",
			values:     []string{"::ffff:203.0.113.7"},
			remoteAddr: "10.0.0.1:1234",
			want:       "203.0.113.7",
		},
		{
			name:       "falls back when every header entry is junk",
			header:     "X-Forwarded-For",
			values:     []string{"garbage"},
			remoteAddr: "203.0.113.7:44321",
			want:       "203.0.113.7",
		},
		{
			name:       "reports nothing when even the peer is unparseable",
			header:     "X-Forwarded-For",
			remoteAddr: "pipe",
			want:       "invalid IP",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
			r.RemoteAddr = tt.remoteAddr
			for _, v := range tt.values {
				r.Header.Add("X-Forwarded-For", v)
			}
			if got := ClientAddr(r, tt.header).String(); got != tt.want {
				t.Errorf("ClientAddr() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestLookup(t *testing.T) {
	db, err := Open(testDB)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})

	tests := []struct {
		addr    string
		wantASN string
		wantOrg string
	}{
		{"203.0.113.7", "AS64496", "Example Transit"},
		{"2001:db8::5", "AS64498", "Example Six"},
		// An entry with no organization still resolves to its number.
		{"198.51.100.4", "AS64497", ASNUnknown},
		// Public, but outside every network in the database.
		{"192.0.2.9", ASNUnknown, ASNUnknown},
		{"10.0.0.1", ASNPrivate, ASNPrivate},
		{"127.0.0.1", ASNPrivate, ASNPrivate},
		{"169.254.1.1", ASNPrivate, ASNPrivate},
		{"100.64.0.9", ASNPrivate, ASNPrivate},
		{"fd00::1", ASNPrivate, ASNPrivate},
	}

	for _, tt := range tests {
		t.Run(tt.addr, func(t *testing.T) {
			asn, org := db.Lookup(netip.MustParseAddr(tt.addr))
			if asn != tt.wantASN || org != tt.wantOrg {
				t.Errorf("Lookup(%s) = (%q, %q), want (%q, %q)", tt.addr, asn, org, tt.wantASN, tt.wantOrg)
			}
		})
	}

	t.Run("invalid address", func(t *testing.T) {
		asn, org := db.Lookup(netip.Addr{})
		if asn != ASNUnknown || org != ASNUnknown {
			t.Errorf("Lookup(invalid) = (%q, %q), want (%q, %q)", asn, org, ASNUnknown, ASNUnknown)
		}
	})
}

// A deployment whose image carries no ASN database must still serve traffic and
// still emit traffic series — every public address just reports as unknown.
func TestNilDatabase(t *testing.T) {
	var db *Database

	if asn, org := db.Lookup(netip.MustParseAddr("203.0.113.7")); asn != ASNUnknown || org != ASNUnknown {
		t.Errorf("Lookup() = (%q, %q), want (%q, %q)", asn, org, ASNUnknown, ASNUnknown)
	}
	if asn, _ := db.Lookup(netip.MustParseAddr("10.0.0.1")); asn != ASNPrivate {
		t.Errorf("Lookup() = %q, want %q", asn, ASNPrivate)
	}
	if err := db.Close(); err != nil {
		t.Errorf("Close: %v", err)
	}
}

func TestOpenMissingDatabase(t *testing.T) {
	if _, err := Open("testdata/does-not-exist.mmdb"); err == nil {
		t.Fatal("Open() on a missing database returned no error")
	}
}

func TestResolve(t *testing.T) {
	db, err := Open(testDB)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer db.Close()

	r := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
	r.RemoteAddr = "10.0.0.1:1234"
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")

	got := db.Resolve(r, "X-Forwarded-For")
	want := Client{IP: "203.0.113.7", ASN: "AS64496", Org: "Example Transit"}
	if got != want {
		t.Errorf("Resolve() = %+v, want %+v", got, want)
	}
}

func TestMiddleware(t *testing.T) {
	want := Client{IP: "203.0.113.7", ASN: "AS64496", Org: "Example Transit"}

	var got Client
	handler := Middleware(func(*http.Request) Client { return want })(
		http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
			got = FromContext(r.Context())
		}),
	)
	handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if got != want {
		t.Errorf("FromContext() = %+v, want %+v", got, want)
	}
}

// Handlers must not depend on the middleware being mounted.
func TestFromContextWithoutMiddleware(t *testing.T) {
	if got := FromContext(t.Context()); got != (Client{}) {
		t.Errorf("FromContext() = %+v, want the zero Client", got)
	}
}
