{{- define "yucca-common.deployment" -}}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "yucca-common.fullname" . }}
  labels:
    {{- include "yucca-common.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicas | default 1 }}
  selector:
    matchLabels:
      {{- include "yucca-common.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "yucca-common.selectorLabels" . | nindent 8 }}
      {{- with .Values.podAnnotations }}
      annotations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
    spec:
      {{- with .Values.serviceAccountName }}
      serviceAccountName: {{ . }}
      {{- end }}
      {{- with .Values.hostAliases }}
      hostAliases:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy | default "IfNotPresent" }}
          {{- with .Values.command }}
          command: {{ toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.args }}
          args: {{ toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.workingDir }}
          workingDir: {{ . }}
          {{- end }}
          ports:
            {{- range .Values.ports }}
            - name: {{ .name }}
              containerPort: {{ .containerPort }}
              protocol: {{ .protocol | default "TCP" }}
            {{- end }}
          {{- with .Values.env }}
          env:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.envFrom }}
          envFrom:
            {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.startupProbe }}
          startupProbe: {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.livenessProbe }}
          livenessProbe: {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.readinessProbe }}
          readinessProbe: {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.resources }}
          resources: {{- toYaml . | nindent 12 }}
          {{- end }}
          {{- with .Values.volumeMounts }}
          volumeMounts: {{- toYaml . | nindent 12 }}
          {{- end }}
      {{- with .Values.volumes }}
      volumes: {{- toYaml . | nindent 8 }}
      {{- end }}
{{- end -}}
