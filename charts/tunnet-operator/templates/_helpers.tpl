{{/*
Expand the name of the chart.
*/}}
{{- define "tunnet-operator.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tunnet-operator.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "tunnet-operator.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "tunnet-operator.labels" -}}
helm.sh/chart: {{ include "tunnet-operator.chart" . }}
{{ include "tunnet-operator.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "tunnet-operator.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tunnet-operator.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "tunnet-operator.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "tunnet-operator.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "tunnet-operator.namespace" -}}
{{- default .Release.Namespace .Values.namespace }}
{{- end }}

{{- define "tunnet-operator.webhookServiceName" -}}
{{ include "tunnet-operator.fullname" . }}-webhook
{{- end }}
