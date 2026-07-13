import { z } from "zod";

export const organizationSsoProviderSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  issuer: z.string(),
  domain: z.string(),
  organizationId: z.string().nullable(),
  /** True when oidcConfig is present. */
  configured: z.boolean(),
  clientId: z.string().nullable(),
  clientSecretSet: z.boolean(),
  discoveryEndpoint: z.string().nullable(),
  scopes: z.array(z.string()),
  pkce: z.boolean(),
});

export const upsertOrganizationSsoProviderBody = z
  .object({
    providerId: z.string().min(1).max(128).optional(),
    issuer: z.string().url(),
    domain: z.string().min(1).max(256),
    clientId: z.string().min(1).max(256),
    clientSecret: z.string().min(1).max(512).optional(),
    discoveryEndpoint: z.string().url().nullable().optional(),
    scopes: z.array(z.string().min(1)).min(1).optional(),
    pkce: z.boolean().optional(),
  })
  .refine((b) => Object.keys(b).length > 0, {
    message: "At least one field must be provided",
  });

export type OrganizationSsoProvider = z.infer<
  typeof organizationSsoProviderSchema
>;
export type UpsertOrganizationSsoProviderBody = z.infer<
  typeof upsertOrganizationSsoProviderBody
>;

export const deviceSshAuthSchema = z.object({
  endpointId: z.string(),
  authenticatedAt: z.string().datetime().nullable(),
  method: z.string().nullable(),
  identityEmail: z.string().nullable(),
});

export type DeviceSshAuth = z.infer<typeof deviceSshAuthSchema>;
