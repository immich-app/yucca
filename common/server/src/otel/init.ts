import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { logs, metrics, NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { env } from '../env.js';

const SpanProcessor = env.NODE_ENV === 'development' ? tracing.SimpleSpanProcessor : tracing.BatchSpanProcessor;
const LogProcessor = env.NODE_ENV === 'development' ? logs.SimpleLogRecordProcessor : logs.BatchLogRecordProcessor;

const otelSDK = new NodeSDK({
  // metrics
  metricReader: new metrics.PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: env.OTEL_METRICS,
      temporalityPreference: metrics.AggregationTemporality.CUMULATIVE,
    }),
    exportIntervalMillis: 1000,
  }),

  // tracing
  sampler:
    env.NODE_ENV === 'development' || env.OTEL_SAMPLE_RATE == 1
      ? new tracing.AlwaysOnSampler()
      : new tracing.TraceIdRatioBasedSampler(env.OTEL_SAMPLE_RATE),
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
      url: env.OTEL_TRACING,
    }),
  ),

  // logging
  logRecordProcessors: [
    new LogProcessor(
      new OTLPLogExporter({
        url: env.OTEL_LOGGING,
      }),
    ),
  ],
  instrumentations: [new PinoInstrumentation()],
});

import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { OpenTelemetryModule } from 'nestjs-otel';

if (env.OTEL_DEBUG) {
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
