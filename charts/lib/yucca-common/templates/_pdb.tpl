{{- define "yucca-common.pdb" -}}
{{- /*
PodDisruptionBudget — rendered only when the chart runs >1 replica (a PDB on a
single replica can never be satisfied and just wedges node drains). minAvailable
defaults to 1; override via .Values.pdb.minAvailable.
*/ -}}
{{- if gt (int (.Values.replicas | default 1)) 1 }}
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: {{ include "yucca-common.fullname" . }}
  labels:
    {{- include "yucca-common.labels" . | nindent 4 }}
spec:
  minAvailable: {{ (.Values.pdb | default dict).minAvailable | default 1 }}
  selector:
    matchLabels:
      {{- include "yucca-common.selectorLabels" . | nindent 6 }}
{{- end }}
{{- end -}}
