// Package geoip identifies a request's remote end: address + announcing AS.
// Traffic metrics label by AS (bounded), never by address (unbounded).
package geoip

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"

	"github.com/oschwald/maxminddb-golang/v2"
)

// Sentinel AS labels: every request gets one of these or a real "AS<number>",
// so a series is never dropped for want of a lookup.
const (
	// ASNPrivate: unannounced addresses (RFC1918, loopback, link-local, ULA,
	// CGNAT). On-net clients (NetBird, internal gateway VIP) land here.
	ASNPrivate = "private"
	// ASNUnknown: public address the DB doesn't resolve — every address when no DB loaded.
	ASNUnknown = "unknown"
)

type Client struct {
	IP string
	// ASN is "AS<number>", ASNPrivate, or ASNUnknown.
	ASN string
	// Org mirrors ASN for the sentinels.
	Org string
}

// Labels returns c's AS labels, substituting ASNUnknown for empties (an empty
// AS label would be worse than unknown).
func (c Client) Labels() (asn, org string) {
	asn, org = c.ASN, c.Org
	if asn == "" {
		asn = ASNUnknown
	}
	if org == "" {
		org = ASNUnknown
	}
	return asn, org
}

// Database resolves addresses against a MaxMind-format ASN database. nil
// resolves nothing (image without a DB file) — degrades to ASNUnknown.
type Database struct {
	reader *maxminddb.Reader
}

// asnRecord: field names fixed by the MaxMind ASN schema (DB-IP's free DB follows it).
type asnRecord struct {
	Number uint32 `maxminddb:"autonomous_system_number"`
	Org    string `maxminddb:"autonomous_system_organization"`
}

// Open memory-maps the ASN database at path.
func Open(path string) (*Database, error) {
	reader, err := maxminddb.Open(path)
	if err != nil {
		return nil, fmt.Errorf("opening ASN database %q: %w", path, err)
	}
	return &Database{reader: reader}, nil
}

func (d *Database) Close() error {
	if d == nil || d.reader == nil {
		return nil
	}
	return d.reader.Close()
}

func (d *Database) Lookup(addr netip.Addr) (asn, org string) {
	if !addr.IsValid() {
		return ASNUnknown, ASNUnknown
	}
	if isPrivate(addr) {
		return ASNPrivate, ASNPrivate
	}
	if d == nil || d.reader == nil {
		return ASNUnknown, ASNUnknown
	}
	var rec asnRecord
	if err := d.reader.Lookup(addr).Decode(&rec); err != nil || rec.Number == 0 {
		return ASNUnknown, ASNUnknown
	}
	org = rec.Org
	if org == "" {
		org = ASNUnknown
	}
	return "AS" + strconv.FormatUint(uint64(rec.Number), 10), org
}

func (d *Database) Resolve(r *http.Request, header string) Client {
	addr := ClientAddr(r, header)
	asn, org := d.Lookup(addr)
	c := Client{ASN: asn, Org: org}
	if addr.IsValid() {
		c.IP = addr.String()
	}
	return c
}

// cgnat: RFC 6598 shared space — carrier NAT, no AS attribution (like RFC1918).
var cgnat = netip.MustParsePrefix("100.64.0.0/10")

func isPrivate(addr netip.Addr) bool {
	return addr.IsPrivate() ||
		addr.IsLoopback() ||
		addr.IsLinkLocalUnicast() ||
		addr.IsLinkLocalMulticast() ||
		addr.IsUnspecified() ||
		cgnat.Contains(addr)
}

// ClientAddr extracts the client address from header, falling back to the
// transport peer. RIGHTMOST entry wins: clients can send any X-Forwarded-For,
// but the gateway APPENDS what it saw — only the last entry is trusted;
// leftmost would let clients pick their own source network.
func ClientAddr(r *http.Request, header string) netip.Addr {
	if header != "" {
		values := r.Header.Values(header)
		for i := len(values) - 1; i >= 0; i-- {
			entries := strings.Split(values[i], ",")
			for j := len(entries) - 1; j >= 0; j-- {
				if addr, ok := parseAddr(entries[j]); ok {
					return addr
				}
			}
		}
	}
	addr, _ := parseAddr(r.RemoteAddr)
	return addr
}

// parseAddr accepts bare, bracketed IPv6, and host:port forms. Zones dropped
// (meaningless off-host; would split a network's series).
func parseAddr(s string) (netip.Addr, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return netip.Addr{}, false
	}
	if addr, err := netip.ParseAddr(strings.Trim(s, "[]")); err == nil {
		return addr.Unmap().WithZone(""), true
	}
	host, _, err := net.SplitHostPort(s)
	if err != nil {
		return netip.Addr{}, false
	}
	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, false
	}
	return addr.Unmap().WithZone(""), true
}

type contextKey struct{}

func NewContext(ctx context.Context, c Client) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}

// Zero Client when no Middleware ran.
func FromContext(ctx context.Context) Client {
	c, _ := ctx.Value(contextKey{}).(Client)
	return c
}

func Middleware(resolve func(*http.Request) Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(NewContext(r.Context(), resolve(r))))
		})
	}
}
