import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { CompositePropagator, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/core';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
// import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { B3Propagator } from '@opentelemetry/propagator-b3';
import { JaegerPropagator } from '@opentelemetry/propagator-jaeger';
import { logs, NodeSDK, tracing } from '@opentelemetry/sdk-node';
// import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { AggregationTemporality, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';

// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const otelSDK = new NodeSDK({
  // metrics

  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: 'http://localhost:8428/opentelemetry/v1/metrics',
      temporalityPreference: AggregationTemporality.CUMULATIVE,
    }),
    exportIntervalMillis: 1000,
  }),
  //   spanProcessor: new BatchSpanProcessor(new JaegerExporter()),
  //   instrumentations: [getNodeAutoInstrumentations()],

  // tracing
  contextManager: new AsyncLocalStorageContextManager(),
  textMapPropagator: new CompositePropagator({
    propagators: [
      new JaegerPropagator(),
      new W3CTraceContextPropagator(),
      new W3CBaggagePropagator(),
      new B3Propagator(),
    ],
  }),
  spanProcessor: new tracing.SimpleSpanProcessor(
    new OTLPTraceExporter({
      url: 'http://localhost:10428/insert/opentelemetry/v1/traces',
    }),
  ),

  // logging
  logRecordProcessors: [
    new logs.SimpleLogRecordProcessor( // todo: new logs.BatchLogRecordProcessor(
      new OTLPLogExporter({
        url: 'http://localhost:9428/insert/opentelemetry/v1/logs',
      }),
    ),
  ],
  instrumentations: [
    new PinoInstrumentation({
      logHook: (span, record) => {
        record['customerId'] = (span as any).attributes.customerId;
      },
    }),
  ],
});

otelSDK.start();

export default otelSDK;

// You can also use the shutdown method to gracefully shut down the SDK before process shutdown
// or on some operating system signal.
process.on('SIGTERM', () => {
  otelSDK
    .shutdown()
    .then(
      () => console.log('SDK shut down successfully'),
      (error) => console.log('Error shutting down SDK', error),
    )
    .finally(() => process.exit(0));
});
