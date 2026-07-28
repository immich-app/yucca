package bench

import "testing"

func TestLoadgenConfigDefaults(t *testing.T) {
	cfg := LoadgenConfig{Clients: []LoadgenClient{{Name: "c1"}}}
	if err := cfg.defaults(); err != nil {
		t.Fatal(err)
	}
	if cfg.Op != LoadgenOpLoad || cfg.CycleSize != 8<<30 || cfg.FileSize != 64<<20 {
		t.Fatalf("defaults = %+v", cfg)
	}
	if cfg.Tag != "yucca-bench-do" || cfg.Compression != "off" || cfg.Connections != 5 {
		t.Fatalf("defaults = %+v", cfg)
	}
	if cfg.StatusPath != cfg.Workdir+"/status.json" {
		t.Fatalf("status path = %q", cfg.StatusPath)
	}
}

func TestLoadgenConfigNoClients(t *testing.T) {
	cfg := LoadgenConfig{}
	if err := cfg.defaults(); err == nil {
		t.Fatal("expected error for empty client list")
	}
}

func TestLoadgenConfigFileSizeClamp(t *testing.T) {
	cfg := LoadgenConfig{Clients: []LoadgenClient{{Name: "c1"}}, CycleSize: 1 << 20}
	if err := cfg.defaults(); err != nil {
		t.Fatal(err)
	}
	if cfg.FileSize != 1<<20 {
		t.Fatalf("file size should clamp to the cycle size, got %d", cfg.FileSize)
	}
}
