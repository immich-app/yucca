package geoip

import (
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"testing"
)

// benchDB opens the database the benchmarks resolve against. testdata's fixture
// holds three networks, which understates lookup cost — a real ASN database is
// ~400k networks and several levels deeper in the search tree. Point
// MICHAEL_BENCH_ASN_DB at a real one to measure what production actually pays:
//
//	go test ./internal/geoip -bench . -benchmem \
//	  -args # MICHAEL_BENCH_ASN_DB=/path/to/dbip-asn-lite.mmdb
func benchDB(b *testing.B) *Database {
	b.Helper()
	path := os.Getenv("MICHAEL_BENCH_ASN_DB")
	if path == "" {
		path = testDB
	}
	db, err := Open(path)
	if err != nil {
		b.Fatalf("Open(%q): %v", path, err)
	}
	b.Cleanup(func() {
		if err := db.Close(); err != nil {
			b.Errorf("Close: %v", err)
		}
	})
	return db
}

// The three outcomes cost different amounts: private short-circuits before the
// database is touched, a hit walks the tree AND decodes a record, a miss walks
// the tree and stops.
func BenchmarkLookup(b *testing.B) {
	db := benchDB(b)

	cases := []struct {
		name string
		addr netip.Addr
	}{
		{"private", netip.MustParseAddr("10.0.0.1")},
		{"hit_v4", netip.MustParseAddr("203.0.113.7")},
		{"hit_v6", netip.MustParseAddr("2001:db8::5")},
		{"miss", netip.MustParseAddr("192.0.2.9")},
	}

	for _, c := range cases {
		b.Run(c.name, func(b *testing.B) {
			b.ReportAllocs()
			for b.Loop() {
				asn, org := db.Lookup(c.addr)
				_, _ = asn, org
			}
		})
	}
}

func BenchmarkClientAddr(b *testing.B) {
	cases := []struct {
		name   string
		header string
		value  string
	}{
		{"no_header", "", ""},
		{"single_entry", "X-Forwarded-For", "203.0.113.7"},
		{"proxy_chain", "X-Forwarded-For", "9.9.9.9, 198.51.100.4, 203.0.113.7"},
	}

	for _, c := range cases {
		b.Run(c.name, func(b *testing.B) {
			r := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
			r.RemoteAddr = "10.0.0.1:44321"
			if c.value != "" {
				r.Header.Set("X-Forwarded-For", c.value)
			}
			b.ReportAllocs()
			for b.Loop() {
				_ = ClientAddr(r, c.header)
			}
		})
	}
}

// What the middleware actually calls once per request: header parse + lookup.
func BenchmarkResolve(b *testing.B) {
	db := benchDB(b)
	r := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
	r.RemoteAddr = "10.0.0.1:44321"
	r.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")

	b.ReportAllocs()
	for b.Loop() {
		_ = db.Resolve(r, "X-Forwarded-For")
	}
}

// The database is memory-mapped and read-only, so lookups should scale across
// michael's concurrent request handlers with no shared mutable state.
func BenchmarkResolveParallel(b *testing.B) {
	db := benchDB(b)

	b.ReportAllocs()
	b.RunParallel(func(pb *testing.PB) {
		r := httptest.NewRequest(http.MethodGet, "/repo/data/abc", nil)
		r.RemoteAddr = "10.0.0.1:44321"
		r.Header.Set("X-Forwarded-For", "9.9.9.9, 203.0.113.7")
		for pb.Next() {
			_ = db.Resolve(r, "X-Forwarded-For")
		}
	})
}
