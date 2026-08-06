import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { logs, metrics, NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { hostname } from 'node:os';
import { otelEnv } from './env.js';

const SpanProcessor = otelEnv.NODE_ENV === 'development' ? tracing.SimpleSpanProcessor : tracing.BatchSpanProcessor;
const LogProcessor = otelEnv.NODE_ENV === 'development' ? logs.SimpleLogRecordProcessor : logs.BatchLogRecordProcessor;

const otelSDK = new NodeSDK({
  // Without service.instance.id replicas export identical series — the TSDB merges them and rate() reads
  // ~1/replicas of real traffic. The SDK merges this with its detected resource (service.name via OTEL_SERVICE_NAME).
  resource: resourceFromAttributes({ 'service.instance.id': hostname() }),

  metricReader: new metrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: otelEnv.OTEL_METRICS,
      temporalityPreference: metrics.AggregationTemporality.CUMULATIVE,
    }),
    exportIntervalMillis: 1000,
  }),

  sampler:
    otelEnv.NODE_ENV === 'development' || otelEnv.OTEL_SAMPLE_RATE == 1
      ? new tracing.AlwaysOnSampler()
      : new tracing.TraceIdRatioBasedSampler(otelEnv.OTEL_SAMPLE_RATE),
  contextManager: new AsyncLocalStorageContextManager(),
  textMapPropagator: new CompositePropagator({
    propagators: [
      new JaegerPropagator(),
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
      new B3Propagator(),
    ],
  }),
  spanProcessor: new SpanProcessor(
    new OTLPTraceExporter({
      url: otelEnv.OTEL_TRACING,
    }),
  ),

  logRecordProcessors: [
    new LogProcessor(
      new OTLPLogExporter({
        url: otelEnv.OTEL_LOGGING,
      }),
    ),
  ],
  instrumentations: [new PinoInstrumentation()],
});

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OpenTelemetryModule } from 'nestjs-otel';

if (otelEnv.OTEL_DEBUG) {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);
}

otelSDK.start();

export const shutdownOtel = () =>
  otelSDK.shutdown().then(
    () => console.log('SDK shut down successfully'),
    (error) => console.log('Error shutting down SDK', error),
  );

export default otelSDK;
export const OtelModule = OpenTelemetryModule.forRoot();
