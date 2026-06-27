{{- define "yucca-common.service" -}}
apiVersion: v1
kind: Service
metadata:
  name: {{ include "yucca-common.fullname" . }}
  labels:
    {{- include "yucca-common.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type | default "ClusterIP" }}
  selector:
    {{- include "yucca-common.selectorLabels" . | nindent 4 }}
  ports:
    {{- range .Values.ports }}
    - name: {{ .name }}
      port: {{ .servicePort | default .containerPort }}
      targetPort: {{ .name }}
      protocol: {{ .protocol | default "TCP" }}
    {{- end }}
{{- end -}}
