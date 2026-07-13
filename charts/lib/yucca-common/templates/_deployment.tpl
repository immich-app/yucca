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
      # Restricted-PSS-compliant defaults (the yucca namespace enforces
      # `restricted`). uid/gid 1000 matches every service Dockerfile (USER
      # node/michael, both 1000) — set explicitly because kubelet can't verify
      # runAsNonRoot against a NAMED image user. Override wholesale via
      # .Values.podSecurityContext when a chart needs something else.
      securityContext:
        {{- if .Values.podSecurityContext }}
        {{- toYaml .Values.podSecurityContext | nindent 8 }}
        {{- else }}
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
        seccompProfile:
          type: RuntimeDefault
        {{- end }}
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          imagePullPolicy: {{ .Values.image.pullPolicy | default "IfNotPresent" }}
          securityContext:
            {{- if .Values.containerSecurityContext }}
            {{- toYaml .Values.containerSecurityContext | nindent 12 }}
            {{- else }}
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities:
              drop: [ALL]
            {{- end }}
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
          # /tmp is always a writable emptyDir: the root filesystem is
          # read-only by default (securityContext above) and the Node runtimes
          # expect a writable tmpdir.
          volumeMounts:
            - name: tmp
              mountPath: /tmp
            {{- with .Values.volumeMounts }}
            {{- toYaml . | nindent 12 }}
            {{- end }}
      volumes:
        - name: tmp
          emptyDir: {}
        {{- with .Values.volumes }}
        {{- toYaml . | nindent 8 }}
        {{- end }}
{{- end -}}
