{{- define "yucca-common.secret" -}}
{{- if .Values.secretData -}}
apiVersion: v1
kind: Secret
metadata:
  name: {{ include "yucca-common.fullname" . }}
  labels:
    {{- include "yucca-common.labels" . | nindent 4 }}
type: Opaque
stringData:
  {{- toYaml .Values.secretData | nindent 2 }}
{{- end -}}
{{- end -}}
