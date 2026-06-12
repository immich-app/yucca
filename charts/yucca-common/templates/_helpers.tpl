{{/*
Fully qualified app name. Falls back to .Release.Name-.Chart.Name.
*/}}
{{- define "yucca-common.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "yucca-common.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "yucca-common.labels" -}}
app.kubernetes.io/name: {{ include "yucca-common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "yucca-common.selectorLabels" -}}
app.kubernetes.io/name: {{ include "yucca-common.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
