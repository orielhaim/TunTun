import { z } from "zod";

/** API key scopes for policy-as-code (Phase 1+). */
export const POLICY_API_KEY_SCOPE_VALUES = [
  "policy:read",
  "policy:write",
  "policy:apply",
] as const;

export type PolicyApiKeyScope = (typeof POLICY_API_KEY_SCOPE_VALUES)[number];

export const policyApiKeyScopeSchema = z.enum(POLICY_API_KEY_SCOPE_VALUES);

/**
 * OAuth2 client credentials grant (Phase 3).
 * Machine-to-machine tokens for Terraform, CI, and automation.
 */
export const oauth2ClientCredentialsTokenRequest = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

export const oauth2ClientCredentialsTokenResponse = z.object({
  access_token: z.string(),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

export const oauth2ClientRegistration = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  name: z.string(),
  scopes: z.array(z.string()),
  organizationId: z.string(),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().nullable(),
});

export type Oauth2ClientCredentialsTokenRequest = z.infer<
  typeof oauth2ClientCredentialsTokenRequest
>;
export type Oauth2ClientCredentialsTokenResponse = z.infer<
  typeof oauth2ClientCredentialsTokenResponse
>;
export type Oauth2ClientRegistration = z.infer<typeof oauth2ClientRegistration>;

/**
 * OIDC federation exchange (Phase 4).
 * CI providers present a workload identity JWT; management returns a short-lived Tunnet token.
 */
export const oidcExchangeRequest = z.object({
  provider: z.enum(["github", "gitlab", "bitbucket"]),
  token: z.string().min(1),
  audience: z.string().optional(),
  organizationId: z.string().min(1),
  scopes: z.array(z.string()).optional(),
});

export const oidcExchangeResponse = z.object({
  accessToken: z.string(),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  scopes: z.array(z.string()),
});

export type OidcExchangeRequest = z.infer<typeof oidcExchangeRequest>;
export type OidcExchangeResponse = z.infer<typeof oidcExchangeResponse>;
