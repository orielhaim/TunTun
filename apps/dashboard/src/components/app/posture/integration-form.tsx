import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { PostureIntegration } from "@/lib/posture-types";

export const INTEGRATION_PROVIDERS = [
  {
    value: "crowdstrike" as const,
    label: "CrowdStrike",
    description: "Falcon API - host and sensor posture attributes",
  },
  {
    value: "sentinelone" as const,
    label: "SentinelOne",
    description: "Management API - agent health and threats",
  },
  {
    value: "intune" as const,
    label: "Microsoft Intune",
    description: "Entra app - compliance and device state",
  },
  {
    value: "custom" as const,
    label: "Custom webhook",
    description: "Push attributes via your own HTTP endpoint",
  },
] as const;

export type IntegrationProvider = PostureIntegration["provider"];

export const POLL_INTERVALS = [
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
] as const;

export type IntegrationFormValues = {
  provider: IntegrationProvider;
  config: Record<string, unknown>;
  pollingIntervalSecs: number;
  enabled: boolean;
};

type HeaderPair = { id: string; key: string; value: string };

function emptyHeaders(): HeaderPair[] {
  return [{ id: crypto.randomUUID(), key: "", value: "" }];
}

function stringField(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

export function defaultConfigFor(
  provider: IntegrationProvider,
): Record<string, unknown> {
  switch (provider) {
    case "crowdstrike":
      return { apiUrl: "", clientId: "", clientSecret: "", cloudRegion: "" };
    case "sentinelone":
      return { apiUrl: "", apiToken: "" };
    case "intune":
      return { tenantId: "", clientId: "", clientSecret: "" };
    case "custom":
      return { webhookUrl: "", sharedSecret: "", headers: {} };
  }
}

function headersFromConfig(config: Record<string, unknown>): HeaderPair[] {
  const raw = config.headers;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length > 0) {
      return entries.map(([key, val]) => ({
        id: crypto.randomUUID(),
        key,
        value: typeof val === "string" ? val : String(val ?? ""),
      }));
    }
  }
  return emptyHeaders();
}

function headersToRecord(pairs: HeaderPair[]): Record<string, string> {
  const next: Record<string, string> = {};
  for (const pair of pairs) {
    const k = pair.key.trim();
    if (k) next[k] = pair.value;
  }
  return next;
}

export function IntegrationFormFields({
  value,
  onChange,
}: {
  value: IntegrationFormValues;
  onChange: (next: IntegrationFormValues) => void;
}) {
  const [headers, setHeaders] = useState<HeaderPair[]>(() =>
    headersFromConfig(value.config),
  );

  function setConfigField(key: string, fieldValue: string) {
    onChange({
      ...value,
      config: { ...value.config, [key]: fieldValue },
    });
  }

  function updateHeaders(next: HeaderPair[]) {
    setHeaders(next);
    onChange({
      ...value,
      config: { ...value.config, headers: headersToRecord(next) },
    });
  }

  function setProvider(provider: IntegrationProvider) {
    const config = defaultConfigFor(provider);
    onChange({
      ...value,
      provider,
      config,
    });
    if (provider === "custom") setHeaders(emptyHeaders());
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="integration-provider">Provider</Label>
        <Select
          value={value.provider}
          onValueChange={(v) => {
            if (v) setProvider(v as IntegrationProvider);
          }}
        >
          <SelectTrigger id="integration-provider">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INTEGRATION_PROVIDERS.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                label={item.label}
              >
                <span className="block">{item.label}</span>
                <span className="text-muted-foreground block text-[11px]">
                  {item.description}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {value.provider === "crowdstrike" ? (
        <>
          <Field
            id="cs-api-url"
            label="API URL"
            value={stringField(value.config, "apiUrl")}
            onChange={(v) => setConfigField("apiUrl", v)}
            placeholder="https://api.crowdstrike.com"
          />
          <Field
            id="cs-client-id"
            label="Client ID"
            value={stringField(value.config, "clientId")}
            onChange={(v) => setConfigField("clientId", v)}
            autoComplete="off"
          />
          <Field
            id="cs-client-secret"
            label="Client secret"
            value={stringField(value.config, "clientSecret")}
            onChange={(v) => setConfigField("clientSecret", v)}
            type="password"
            autoComplete="new-password"
          />
          <Field
            id="cs-region"
            label="Cloud region"
            value={stringField(value.config, "cloudRegion")}
            onChange={(v) => setConfigField("cloudRegion", v)}
            placeholder="us-1 (optional)"
            optional
          />
        </>
      ) : null}

      {value.provider === "sentinelone" ? (
        <>
          <Field
            id="s1-api-url"
            label="API URL"
            value={stringField(value.config, "apiUrl")}
            onChange={(v) => setConfigField("apiUrl", v)}
            placeholder="https://usea1.sentinelone.net"
          />
          <Field
            id="s1-token"
            label="API token"
            value={stringField(value.config, "apiToken")}
            onChange={(v) => setConfigField("apiToken", v)}
            type="password"
            autoComplete="new-password"
          />
        </>
      ) : null}

      {value.provider === "intune" ? (
        <>
          <Field
            id="intune-tenant"
            label="Tenant ID"
            value={stringField(value.config, "tenantId")}
            onChange={(v) => setConfigField("tenantId", v)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
          <Field
            id="intune-client-id"
            label="Client ID"
            value={stringField(value.config, "clientId")}
            onChange={(v) => setConfigField("clientId", v)}
            autoComplete="off"
          />
          <Field
            id="intune-secret"
            label="Client secret"
            value={stringField(value.config, "clientSecret")}
            onChange={(v) => setConfigField("clientSecret", v)}
            type="password"
            autoComplete="new-password"
          />
        </>
      ) : null}

      {value.provider === "custom" ? (
        <>
          <Field
            id="custom-webhook"
            label="Webhook URL"
            value={stringField(value.config, "webhookUrl")}
            onChange={(v) => setConfigField("webhookUrl", v)}
            placeholder="https://example.com/posture"
          />
          <Field
            id="custom-secret"
            label="Shared secret"
            value={stringField(value.config, "sharedSecret")}
            onChange={(v) => setConfigField("sharedSecret", v)}
            type="password"
            autoComplete="new-password"
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Headers</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() =>
                  updateHeaders([
                    ...headers,
                    { id: crypto.randomUUID(), key: "", value: "" },
                  ])
                }
              >
                <PlusIcon className="mr-1 size-3" />
                Add header
              </Button>
            </div>
            <div className="space-y-2">
              {headers.map((pair) => (
                <div key={pair.id} className="flex gap-2">
                  <Input
                    aria-label="Header name"
                    placeholder="Name"
                    className="h-8"
                    value={pair.key}
                    onChange={(e) =>
                      updateHeaders(
                        headers.map((h) =>
                          h.id === pair.id ? { ...h, key: e.target.value } : h,
                        ),
                      )
                    }
                  />
                  <Input
                    aria-label="Header value"
                    placeholder="Value"
                    className="h-8"
                    value={pair.value}
                    onChange={(e) =>
                      updateHeaders(
                        headers.map((h) =>
                          h.id === pair.id
                            ? { ...h, value: e.target.value }
                            : h,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove header"
                    disabled={headers.length <= 1}
                    onClick={() =>
                      updateHeaders(
                        headers.length <= 1
                          ? emptyHeaders()
                          : headers.filter((h) => h.id !== pair.id),
                      )
                    }
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <p className="text-muted-foreground text-[11px]">
              Optional request headers sent with each poll.
            </p>
          </div>
        </>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="integration-poll">Polling interval</Label>
        <Select
          value={String(value.pollingIntervalSecs)}
          onValueChange={(v) => {
            if (v == null) return;
            onChange({
              ...value,
              pollingIntervalSecs: Number(v) || 300,
            });
          }}
        >
          <SelectTrigger id="integration-poll">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POLL_INTERVALS.map((item) => (
              <SelectItem key={item.value} value={String(item.value)}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
        <div>
          <Label htmlFor="integration-enabled" className="text-sm">
            Enabled
          </Label>
          <p className="text-muted-foreground text-[11px]">
            Start syncing attributes after create
          </p>
        </div>
        <Switch
          id="integration-enabled"
          checked={value.enabled}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  optional,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "password";
  placeholder?: string;
  optional?: boolean;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {optional ? (
          <span className="text-muted-foreground ml-1 font-normal">
            (optional)
          </span>
        ) : null}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
    </div>
  );
}

export function validateIntegrationForm(
  values: IntegrationFormValues,
): string | null {
  const c = values.config;
  switch (values.provider) {
    case "crowdstrike":
      if (!stringField(c, "apiUrl").trim()) return "API URL is required";
      if (!stringField(c, "clientId").trim()) return "Client ID is required";
      if (!stringField(c, "clientSecret").trim())
        return "Client secret is required";
      break;
    case "sentinelone":
      if (!stringField(c, "apiUrl").trim()) return "API URL is required";
      if (!stringField(c, "apiToken").trim()) return "API token is required";
      break;
    case "intune":
      if (!stringField(c, "tenantId").trim()) return "Tenant ID is required";
      if (!stringField(c, "clientId").trim()) return "Client ID is required";
      if (!stringField(c, "clientSecret").trim())
        return "Client secret is required";
      break;
    case "custom":
      if (!stringField(c, "webhookUrl").trim())
        return "Webhook URL is required";
      if (!stringField(c, "sharedSecret").trim())
        return "Shared secret is required";
      break;
  }
  return null;
}

export function sanitizeIntegrationConfig(
  provider: IntegrationProvider,
  config: Record<string, unknown>,
): Record<string, unknown> {
  switch (provider) {
    case "crowdstrike": {
      const out: Record<string, unknown> = {
        apiUrl: stringField(config, "apiUrl").trim(),
        clientId: stringField(config, "clientId").trim(),
        clientSecret: stringField(config, "clientSecret"),
      };
      const region = stringField(config, "cloudRegion").trim();
      if (region) out.cloudRegion = region;
      return out;
    }
    case "sentinelone":
      return {
        apiUrl: stringField(config, "apiUrl").trim(),
        apiToken: stringField(config, "apiToken"),
      };
    case "intune":
      return {
        tenantId: stringField(config, "tenantId").trim(),
        clientId: stringField(config, "clientId").trim(),
        clientSecret: stringField(config, "clientSecret"),
      };
    case "custom": {
      const headersRaw = config.headers;
      const headers: Record<string, string> = {};
      if (
        headersRaw &&
        typeof headersRaw === "object" &&
        !Array.isArray(headersRaw)
      ) {
        for (const [k, v] of Object.entries(
          headersRaw as Record<string, unknown>,
        )) {
          if (k.trim())
            headers[k.trim()] = typeof v === "string" ? v : String(v ?? "");
        }
      }
      return {
        webhookUrl: stringField(config, "webhookUrl").trim(),
        sharedSecret: stringField(config, "sharedSecret"),
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      };
    }
  }
}
