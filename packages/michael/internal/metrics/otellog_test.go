package metrics

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/rs/zerolog"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

// memoryExporter collects exported log records in memory for assertions.
type memoryExporter struct {
	mu      sync.Mutex
	records []sdklog.Record
}

func (e *memoryExporter) Export(_ context.Context, records []sdklog.Record) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.records = append(e.records, records...)
	return nil
}

func (e *memoryExporter) Shutdown(_ context.Context) error { return nil }
func (e *memoryExporter) ForceFlush(_ context.Context) error { return nil }

func (e *memoryExporter) Records() []sdklog.Record {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]sdklog.Record{}, e.records...)
}

func TestOTLPLogWriter_InfoLog(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	// Write a zerolog entry through the bridge
	logger := zerolog.New(w).With().Timestamp().Logger()
	logger.Info().Str("request_id", "abc-123").Str("user", "user-1").Msg("test message")

	// Force flush
	if err := provider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}

	records := exporter.Records()
	if len(records) == 0 {
		t.Fatal("expected at least one log record, got none")
	}

	rec := records[0]

	// Check severity
	if rec.Severity() != otellog.SeverityInfo {
		t.Errorf("expected SeverityInfo, got %v", rec.Severity())
	}
	if rec.SeverityText() != "info" {
		t.Errorf("expected severity text 'info', got %q", rec.SeverityText())
	}

	// Check body
	if rec.Body().AsString() != "test message" {
		t.Errorf("expected body 'test message', got %q", rec.Body().AsString())
	}

	// Check timestamp is set and reasonable
	if rec.Timestamp().IsZero() {
		t.Error("expected non-zero timestamp")
	}

	// Check attributes contain our structured fields
	attrs := map[string]string{}
	rec.WalkAttributes(func(kv otellog.KeyValue) bool {
		attrs[kv.Key] = kv.Value.AsString()
		return true
	})

	if attrs["request_id"] != "abc-123" {
		t.Errorf("expected request_id='abc-123', got %q", attrs["request_id"])
	}
	if attrs["user"] != "user-1" {
		t.Errorf("expected user='user-1', got %q", attrs["user"])
	}
}

func TestOTLPLogWriter_ErrorLog(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	logger := zerolog.New(w).With().Timestamp().Logger()
	logger.Error().Str("error", "connection refused").Str("repository", "repo-1").Msg("list blobs failed")

	if err := provider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}

	records := exporter.Records()
	if len(records) == 0 {
		t.Fatal("expected at least one log record, got none")
	}

	rec := records[0]

	if rec.Severity() != otellog.SeverityError {
		t.Errorf("expected SeverityError, got %v", rec.Severity())
	}
	if rec.Body().AsString() != "list blobs failed" {
		t.Errorf("expected body 'list blobs failed', got %q", rec.Body().AsString())
	}

	attrs := map[string]string{}
	rec.WalkAttributes(func(kv otellog.KeyValue) bool {
		attrs[kv.Key] = kv.Value.AsString()
		return true
	})
	if attrs["error"] != "connection refused" {
		t.Errorf("expected error='connection refused', got %q", attrs["error"])
	}
	if attrs["repository"] != "repo-1" {
		t.Errorf("expected repository='repo-1', got %q", attrs["repository"])
	}
}

func TestOTLPLogWriter_AllSeverities(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	logger := zerolog.New(w).With().Timestamp().Logger()
	zerolog.SetGlobalLevel(zerolog.TraceLevel)
	defer zerolog.SetGlobalLevel(zerolog.InfoLevel)

	tests := []struct {
		emit func()
		sev  otellog.Severity
		text string
	}{
		{func() { logger.Trace().Msg("t") }, otellog.SeverityTrace, "trace"},
		{func() { logger.Debug().Msg("d") }, otellog.SeverityDebug, "debug"},
		{func() { logger.Info().Msg("i") }, otellog.SeverityInfo, "info"},
		{func() { logger.Warn().Msg("w") }, otellog.SeverityWarn, "warn"},
		{func() { logger.Error().Msg("e") }, otellog.SeverityError, "error"},
	}

	for _, tt := range tests {
		tt.emit()
	}

	if err := provider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}

	records := exporter.Records()
	if len(records) != len(tests) {
		t.Fatalf("expected %d records, got %d", len(tests), len(records))
	}

	for i, tt := range tests {
		if records[i].Severity() != tt.sev {
			t.Errorf("record %d: expected severity %v, got %v", i, tt.sev, records[i].Severity())
		}
		if records[i].SeverityText() != tt.text {
			t.Errorf("record %d: expected severity text %q, got %q", i, tt.text, records[i].SeverityText())
		}
	}
}

func TestOTLPLogWriter_NumericAttributes(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	logger := zerolog.New(w).With().Timestamp().Logger()
	logger.Info().Int("status", 200).Dur("duration", 42*time.Millisecond).Msg("request done")

	if err := provider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}

	records := exporter.Records()
	if len(records) == 0 {
		t.Fatal("expected at least one record")
	}

	found := map[string]bool{}
	records[0].WalkAttributes(func(kv otellog.KeyValue) bool {
		found[kv.Key] = true
		return true
	})

	if !found["status"] {
		t.Error("expected 'status' attribute")
	}
	if !found["duration"] {
		t.Error("expected 'duration' attribute")
	}
}

func TestOTLPLogWriter_InvalidJSON(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	// Write invalid JSON — should not panic or export anything
	n, err := w.Write([]byte("not json at all"))
	if err != nil {
		t.Errorf("expected no error, got %v", err)
	}
	if n != 15 {
		t.Errorf("expected n=15, got %d", n)
	}

	if err := provider.ForceFlush(context.Background()); err != nil {
		t.Fatal(err)
	}

	if len(exporter.Records()) != 0 {
		t.Error("expected no records for invalid JSON")
	}
}

func TestOTLPLogWriter_Shutdown(t *testing.T) {
	exporter := &memoryExporter{}
	provider := sdklog.NewLoggerProvider(
		sdklog.WithProcessor(sdklog.NewSimpleProcessor(exporter)),
	)
	w := NewOTLPLogWriter(provider)

	// Write a log, then shut down, and verify the record was flushed
	logger := zerolog.New(w).With().Timestamp().Logger()
	logger.Info().Msg("before shutdown")

	if err := w.Shutdown(context.Background()); err != nil {
		t.Fatalf("shutdown error: %v", err)
	}

	if len(exporter.Records()) == 0 {
		t.Error("expected records to be flushed on shutdown")
	}
}
