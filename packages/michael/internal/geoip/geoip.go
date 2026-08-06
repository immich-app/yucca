// Package geoip identifies the remote end of a request: its network address and
// the autonomous system announcing that address. Traffic metrics are labelled by
// AS rather than by address — an AS label is bounded by the number of networks
// that reach us, an address label is not.
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

// Sentinel AS labels. Every request gets one of these or a real "AS<number>",
// so a traffic series is never dropped for want of a lookup.
const (
	// ASNPrivate covers addresses no registry announces: RFC1918, loopback,
	// link-local, unique-local, CGNAT. On-net clients (NetBird, the internal
	// gateway VIP) land here.
	ASNPrivate = "private"
	// ASNUnknown is a public address the database does not resolve — including
	// every address when no database is loaded.
	ASNUnknown = "unknown"
)

// Client is the resolved identity of a request's remote end.
type Client struct {
	// IP is the client address in textual form, empty when unresolvable.
	IP string
	// ASN is "AS<number>", ASNPrivate, or ASNUnknown.
	ASN string
	// Org is the AS organization name; it mirrors ASN for the sentinels.
	Org string
}

// Labels returns c's AS labels, substituting the unknown sentinel for a Client
// nothing resolved — a metric series labelled with an empty AS would be worse
// than one labelled unknown.
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

// Database resolves addresses against a MaxMind-format ASN database. A nil
// *Database resolves nothing — that is what a deployment whose image carries no
// database file gets, and it degrades to ASNUnknown rather than failing.
type Database struct {
	reader *maxminddb.Reader
}

// asnRecord is the subset of an ASN database record we label with. Field names
// are fixed by the MaxMind ASN schema, which DB-IP's free ASN database follows.
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

// Lookup returns the AS labels for addr.
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

// Resolve returns the client identity of a request. The address is read from
// header, falling back to the transport peer when the header is absent.
func (d *Database) Resolve(r *http.Request, header string) Client {
	addr := ClientAddr(r, header)
	asn, org := d.Lookup(addr)
	c := Client{ASN: asn, Org: org}
	if addr.IsValid() {
		c.IP = addr.String()
	}
	return c
}

// cgnat is RFC 6598 shared address space — carrier NAT, not globally routed, so
// it is no more attributable to an AS than RFC1918 is.
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
// request's transport peer when header is unset or holds nothing parseable.
//
// The RIGHTMOST header entry wins, and that is the whole point: a client may
// send any X-Forwarded-For it likes and the gateway APPENDS the address it
// actually saw, so only the last entry is written by something we trust.
// Reading the leftmost entry — the usual reflex — would let any client pick its
// own source network.
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

// parseAddr accepts the forms an address reaches us in: bare, bracketed IPv6,
// and host:port. Zones are dropped — they are meaningless off-host and would
// split one network's series in two.
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

// NewContext returns a new context carrying the given Client.
func NewContext(ctx context.Context, c Client) context.Context {
	return context.WithValue(ctx, contextKey{}, c)
}

// FromContext returns the Client resolved for this request, or the zero Client
// when no Middleware ran.
func FromContext(ctx context.Context) Client {
	c, _ := ctx.Value(contextKey{}).(Client)
	return c
}

// Middleware resolves the client once per request so the access log and the
// traffic metrics agree on who sent it without each paying for a lookup.
func Middleware(resolve func(*http.Request) Client) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r.WithContext(NewContext(r.Context(), resolve(r))))
		})
	}
}
