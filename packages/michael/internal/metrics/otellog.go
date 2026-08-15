package metrics

import (
	"context"
	"encoding/json"
	"time"

	"michael/internal/config"

	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploghttp"
	otellog "go.opentelemetry.io/otel/log"
	sdklog "go.opentelemetry.io/otel/sdk/log"
)

var zerologLevel = map[string]otellog.Severity{
	"trace": otellog.SeverityTrace,
	"debug": otellog.SeverityDebug,
	"info":  otellog.SeverityInfo,
	"warn":  otellog.SeverityWarn,
	"error": otellog.SeverityError,
	"fatal": otellog.SeverityFatal,
	"panic": otellog.SeverityFatal4,
}

type OTLPLogWriter struct {
	logger   otellog.Logger
	provider *sdklog.LoggerProvider
}

func SetupLogProvider(cfg config.Config) (*sdklog.LoggerProvider, error) {
	ctx := context.Background()

	opts := []otlploghttp.Option{
		otlploghttp.WithEndpoint(cfg.OTLPLogsEndpoint),
		otlploghttp.WithInsecure(),
	}
	if cfg.OTLPLogsURLPath != "" {
		opts = append(opts, otlploghttp.WithURLPath(cfg.OTLPLogsURLPath))
	}

	exporter, err := otlploghttp.New(ctx, opts...)
	if err != nil {
		return nil, err
	}

	provider := sdklog.NewLoggerProvider(
		sdklog.WithResource(otelResource()),
		sdklog.WithProcessor(sdklog.NewBatchProcessor(exporter)),
	)
	return provider, nil
}

func NewOTLPLogWriter(provider *sdklog.LoggerProvider) *OTLPLogWriter {
	return &OTLPLogWriter{
		logger:   provider.Logger("michael"),
		provider: provider,
	}
}

func (w *OTLPLogWriter) Write(p []byte) (int, error) {
	var entry map[string]interface{}
	if err := json.Unmarshal(p, &entry); err != nil {
		// Not JSON — pass through length but skip OTEL export.
		return len(p), nil
	}

	var record otellog.Record

	if lvl, ok := entry["level"].(string); ok {
		if sev, found := zerologLevel[lvl]; found {
			record.SetSeverity(sev)
			record.SetSeverityText(lvl)
		}
	}

	if ts, ok := entry["time"].(string); ok {
		if t, err := time.Parse(time.RFC3339, ts); err == nil {
			record.SetTimestamp(t)
		}
	}

	if msg, ok := entry["message"].(string); ok {
		record.SetBody(otellog.StringValue(msg))
	}

	attrs := make([]otellog.KeyValue, 0, len(entry))
	for k, v := range entry {
		switch k {
		case "level", "time", "message", "caller":
			continue
		}
		switch val := v.(type) {
		case string:
			attrs = append(attrs, otellog.String(k, val))
		case float64:
			attrs = append(attrs, otellog.Float64(k, val))
		case bool:
			attrs = append(attrs, otellog.Bool(k, val))
		default:
			if b, err := json.Marshal(val); err == nil {
				attrs = append(attrs, otellog.String(k, string(b)))
			}
		}
	}
	record.AddAttributes(attrs...)

	w.logger.Emit(context.Background(), record)

	return len(p), nil
}

func (w *OTLPLogWriter) Shutdown(ctx context.Context) error {
	return w.provider.Shutdown(ctx)
}
