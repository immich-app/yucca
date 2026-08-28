// Package metrics ships columbo's fleet health to o11y over the normal OTLP
// route (vmagent), mirroring michael's exporter wiring. Instruments are
// labelled by trigger and outcome only — never by user or investigation id,
// which live in the audit log.
package metrics

import (
	"context"
	"fmt"
	"time"

	"columbo/internal/agent"

	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlpmetric/otlpmetrichttp"
	otelmetric "go.opentelemetry.io/otel/metric"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
)

type Recorder struct {
	provider       *sdkmetric.MeterProvider
	investigations otelmetric.Int64Counter
	toolCalls      otelmetric.Int64Counter
	tokens         otelmetric.Int64Counter
	duration       otelmetric.Float64Histogram
}

// Setup builds the OTLP-backed recorder; an empty endpoint returns a nil
// Recorder, whose methods are all no-ops.
func Setup(endpoint, urlPath string, interval time.Duration) (*Recorder, error) {
	if endpoint == "" {
		return nil, nil
	}
	opts := []otlpmetrichttp.Option{
		otlpmetrichttp.WithEndpoint(endpoint),
		otlpmetrichttp.WithInsecure(),
	}
	if urlPath != "" {
		opts = append(opts, otlpmetrichttp.WithURLPath(urlPath))
	}
	exporter, err := otlpmetrichttp.New(context.Background(), opts...)
	if err != nil {
		return nil, fmt.Errorf("creating OTLP metric exporter: %w", err)
	}
	provider := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(resource.NewWithAttributes(semconv.SchemaURL, semconv.ServiceName("columbo"))),
		sdkmetric.WithReader(sdkmetric.NewPeriodicReader(exporter, sdkmetric.WithInterval(interval))),
	)

	meter := provider.Meter("columbo")
	investigations, err := meter.Int64Counter("columbo.investigations",
		otelmetric.WithDescription("Investigations by trigger and outcome"))
	if err != nil {
		return nil, err
	}
	toolCalls, err := meter.Int64Counter("columbo.tool_calls",
		otelmetric.WithDescription("Tool calls spent by investigations"))
	if err != nil {
		return nil, err
	}
	tokens, err := meter.Int64Counter("columbo.tokens",
		otelmetric.WithDescription("Model tokens spent by investigations, by direction"))
	if err != nil {
		return nil, err
	}
	duration, err := meter.Float64Histogram("columbo.investigation.duration",
		otelmetric.WithDescription("Investigation wall-clock duration"),
		otelmetric.WithUnit("s"))
	if err != nil {
		return nil, err
	}
	return &Recorder{
		provider:       provider,
		investigations: investigations,
		toolCalls:      toolCalls,
		tokens:         tokens,
		duration:       duration,
	}, nil
}

// Record accounts one finished (or skipped/failed) investigation.
func (r *Recorder) Record(ctx context.Context, trigger, outcome string, o agent.Outcome) {
	if r == nil {
		return
	}
	byTrigger := otelmetric.WithAttributeSet(attribute.NewSet(attribute.String("trigger", trigger)))
	r.investigations.Add(ctx, 1, otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("trigger", trigger),
		attribute.String("outcome", outcome),
	)))
	r.toolCalls.Add(ctx, int64(o.ToolCalls), byTrigger)
	r.tokens.Add(ctx, int64(o.PromptTokens), otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("trigger", trigger),
		attribute.String("direction", "prompt"),
	)))
	r.tokens.Add(ctx, int64(o.CompletionTokens), otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("trigger", trigger),
		attribute.String("direction", "completion"),
	)))
	r.duration.Record(ctx, o.Duration.Seconds(), otelmetric.WithAttributeSet(attribute.NewSet(
		attribute.String("trigger", trigger),
		attribute.String("outcome", outcome),
	)))
}

func (r *Recorder) Shutdown(ctx context.Context) error {
	if r == nil {
		return nil
	}
	return r.provider.Shutdown(ctx)
}
