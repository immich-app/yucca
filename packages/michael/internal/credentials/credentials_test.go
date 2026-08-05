package credentials

import (
	"bytes"
	"encoding/base64"
	"strings"
	"testing"
)

var testKey = bytes.Repeat([]byte{0x2a}, 32)

func TestSealOpenRoundTrip(t *testing.T) {
	want := Credentials{AccessKeyID: "AKIAREPO", SecretAccessKey: "s3cret"}

	sealed, err := Seal(testKey, "repo-1", want)
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}
	got, err := Open([][]byte{testKey}, "repo-1", sealed)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	if got != want {
		t.Errorf("round trip mismatch: got %+v, want %+v", got, want)
	}
}

func TestOpenRejectsAnotherRepositorysBlob(t *testing.T) {
	sealed, err := Seal(testKey, "repo-1", Credentials{AccessKeyID: "a", SecretAccessKey: "b"})
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if _, err := Open([][]byte{testKey}, "repo-2", sealed); err == nil {
		t.Fatal("expected a blob sealed for repo-1 to fail against repo-2")
	}
}

// A rotation runs with both keys configured, so neither side restarts first.
func TestOpenAcceptsAnyConfiguredKey(t *testing.T) {
	oldKey := bytes.Repeat([]byte{0x11}, 32)
	newKey := bytes.Repeat([]byte{0x22}, 32)

	for name, key := range map[string][]byte{"old": oldKey, "new": newKey} {
		t.Run(name, func(t *testing.T) {
			sealed, err := Seal(key, "repo-1", Credentials{AccessKeyID: "a", SecretAccessKey: "b"})
			if err != nil {
				t.Fatalf("Seal: %v", err)
			}
			if _, err := Open([][]byte{newKey, oldKey}, "repo-1", sealed); err != nil {
				t.Fatalf("Open with both keys configured: %v", err)
			}
		})
	}
}

func TestOpenRejectsUnknownKey(t *testing.T) {
	sealed, err := Seal(testKey, "repo-1", Credentials{AccessKeyID: "a", SecretAccessKey: "b"})
	if err != nil {
		t.Fatalf("Seal: %v", err)
	}

	if _, err := Open([][]byte{bytes.Repeat([]byte{0x99}, 32)}, "repo-1", sealed); err == nil {
		t.Fatal("expected an unknown key to fail")
	}
}

// The producer is TypeScript (@common/server sealStorageCredentials) and the
// consumer is this package, so the format is pinned by a fixture the TS side
// actually emitted, not by this package's own round trip.
func TestOpenTypeScriptFixture(t *testing.T) {
	const sealed = "AU4he_wpRIQ5oOmfSJSMmHrxBGCCHG3VEIK6D_Y7ivi4y_rRLwGNK9Zk--dCK1apZ6d44R8y7CPhF4lVj8gu4LBJo1MSK5_FHGAQQV6-g24I4puAOLxt8uDh0E61"

	got, err := Open([][]byte{testKey}, "repo-1234", sealed)
	if err != nil {
		t.Fatalf("Open TypeScript fixture: %v", err)
	}
	want := Credentials{AccessKeyID: "AKIAFIXTURE", SecretAccessKey: "fixture-secret"}
	if got != want {
		t.Errorf("fixture mismatch: got %+v, want %+v", got, want)
	}
}

func TestOpenRejectsMalformedBlobs(t *testing.T) {
	cases := map[string]string{
		"not base64": "!!!not-base64!!!",
		"truncated":  "AQID",
		"wrong version": func() string {
			sealed, err := Seal(testKey, "repo-1", Credentials{AccessKeyID: "a", SecretAccessKey: "b"})
			if err != nil {
				t.Fatalf("Seal: %v", err)
			}
			return "Ag" + sealed[2:]
		}(),
	}

	for name, sealed := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := Open([][]byte{testKey}, "repo-1", sealed); err == nil {
				t.Fatal("expected an error")
			}
		})
	}
}

func TestParseKeys(t *testing.T) {
	first := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x11}, 32))
	second := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x22}, 32))

	keys, err := ParseKeys(first + ", " + second)
	if err != nil {
		t.Fatalf("ParseKeys: %v", err)
	}
	if len(keys) != 2 || !bytes.Equal(keys[0], bytes.Repeat([]byte{0x11}, 32)) {
		t.Fatalf("expected the first key to stay first, got %d keys", len(keys))
	}

	for name, value := range map[string]string{
		"empty":      "",
		"not base64": "@@@",
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ParseKeys(value); err == nil {
				t.Fatal("expected an error")
			}
		})
	}

	t.Run("wrong size", func(t *testing.T) {
		if _, err := ParseKeys("c2hvcnQ="); err == nil || !strings.Contains(err.Error(), "32 bytes") {
			t.Fatalf("expected a size error, got %v", err)
		}
	})
}

func TestFingerprintDistinguishesCredentials(t *testing.T) {
	a := Credentials{AccessKeyID: "one", SecretAccessKey: "two"}
	b := Credentials{AccessKeyID: "onetwo", SecretAccessKey: ""}

	if a.Fingerprint() == b.Fingerprint() {
		t.Error("fingerprint must not collide across a shifted field boundary")
	}
}
