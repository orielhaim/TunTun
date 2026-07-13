CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"client_id" text,
	"scope" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"polling_interval" integer
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_access_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text,
	"reference_id" text,
	"refresh_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_access_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"client_secret" text,
	"disabled" boolean DEFAULT false,
	"skip_consent" boolean,
	"enable_end_session" boolean,
	"subject_type" text,
	"scopes" text[],
	"user_id" text,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"name" text,
	"uri" text,
	"icon" text,
	"contacts" text[],
	"tos" text,
	"policy" text,
	"software_id" text,
	"software_version" text,
	"software_statement" text,
	"redirect_uris" text[] NOT NULL,
	"post_logout_redirect_uris" text[],
	"token_endpoint_auth_method" text,
	"grant_types" text[],
	"response_types" text[],
	"public" boolean,
	"type" text,
	"require_pkce" boolean,
	"reference_id" text,
	"metadata" jsonb,
	CONSTRAINT "oauth_client_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_consent" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"user_id" text,
	"reference_id" text,
	"scopes" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_refresh_token" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"client_id" text NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"reference_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"revoked" timestamp with time zone,
	"auth_time" timestamp with time zone,
	"scopes" text[] NOT NULL,
	CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"metadata" jsonb,
	"snapshot_version" bigint DEFAULT 0 NOT NULL,
	"quick_enroll_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_identifier_value_unique" UNIQUE("identifier","value")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_prefix" text,
	"hashed_secret" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"network_ids" uuid[],
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"actor" text,
	"action" text NOT NULL,
	"target" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_presence_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"event" text NOT NULL,
	"public_ip" "inet",
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_profiles" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"network_id" uuid NOT NULL,
	"exit_node_endpoint_id" text,
	"split_tunnel_mode" text DEFAULT 'exclude' NOT NULL,
	"split_tunnel_cidrs" "cidr"[] DEFAULT '{}' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_profiles_split_tunnel_mode_check" CHECK ("device_profiles"."split_tunnel_mode" IN ('include', 'exclude'))
);
--> statement-breakpoint
CREATE TABLE "device_tags" (
	"endpoint_id" text NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "device_tags_endpoint_id_tag_pk" PRIMARY KEY("endpoint_id","tag")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tenant_ipv6" "inet" NOT NULL,
	"ipv6_enabled" boolean DEFAULT false NOT NULL,
	"ipv6_enabled_at" timestamp with time zone,
	"public_ip" "inet",
	"agent_connected" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"disconnected_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"type" text DEFAULT 'agent' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "devices_tenant_ipv6_unique" UNIQUE("tenant_ipv6"),
	CONSTRAINT "devices_endpoint_id_len" CHECK (char_length("devices"."endpoint_id") = 64),
	CONSTRAINT "devices_type_check" CHECK ("devices"."type" IN ('agent', 'sdk')),
	CONSTRAINT "devices_ipv6_enabled_at_check" CHECK ((NOT "devices"."ipv6_enabled") OR ("devices"."ipv6_enabled_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "endpoint_send_settings" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"consent_mode" text DEFAULT 'prompt' NOT NULL,
	"inbox_path" text,
	"pin_blobs" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "endpoint_send_settings_consent_check" CHECK ("endpoint_send_settings"."consent_mode" IN ('auto_accept', 'prompt', 'deny'))
);
--> statement-breakpoint
CREATE TABLE "enrollment_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exit_node_config" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"network_id" uuid NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"allowed_cidrs" "cidr"[] DEFAULT '{"0.0.0.0/0"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_transfers" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"sender_endpoint_id" text NOT NULL,
	"receiver_endpoint_id" text,
	"file_name" text NOT NULL,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"blake3_hash" text NOT NULL,
	"status" text DEFAULT 'offered' NOT NULL,
	"progress_pct" integer DEFAULT 0 NOT NULL,
	"bytes_transferred" bigint DEFAULT 0 NOT NULL,
	"error" text,
	"message" text,
	"inbox_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "file_transfers_status_check" CHECK ("file_transfers"."status" IN ('offered', 'pending', 'transferring', 'completed', 'failed', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "hostname_routes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"is_wildcard" boolean DEFAULT false NOT NULL,
	"target_ip" "inet",
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hostname_routes_network_hostname_unique" UNIQUE("network_id","hostname","is_wildcard")
);
--> statement-breakpoint
CREATE TABLE "internal_certificates" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"hostname" text NOT NULL,
	"certificate_pem" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "internal_certificates_endpoint_hostname_unique" UNIQUE("endpoint_id","hostname")
);
--> statement-breakpoint
CREATE TABLE "network_memberships" (
	"endpoint_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"assigned_ip" "inet" NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_memberships_endpoint_id_network_id_pk" PRIMARY KEY("endpoint_id","network_id"),
	CONSTRAINT "network_memberships_network_id_assigned_ip_unique" UNIQUE("network_id","assigned_ip"),
	CONSTRAINT "network_memberships_status_check" CHECK ("network_memberships"."status" IN ('active', 'suspended', 'pending'))
);
--> statement-breakpoint
CREATE TABLE "networks" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"cidr" "cidr" NOT NULL,
	"mtu" integer DEFAULT 1280 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "networks_organization_id_name_unique" UNIQUE("organization_id","name")
);
--> statement-breakpoint
CREATE TABLE "node_group_members" (
	"group_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_group_members_group_id_endpoint_id_pk" PRIMARY KEY("group_id","endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "node_groups" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"network_id" uuid NOT NULL,
	"name" text NOT NULL,
	"ha_enabled" boolean DEFAULT true NOT NULL,
	"active_endpoint_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "node_groups_network_name_unique" UNIQUE("network_id","name")
);
--> statement-breakpoint
CREATE TABLE "organization_cas" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"certificate_pem" text NOT NULL,
	"encrypted_private_key" text NOT NULL,
	"fingerprint_sha256" text NOT NULL,
	"not_before" timestamp with time zone NOT NULL,
	"not_after" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "organization_cas_status_check" CHECK ("organization_cas"."status" IN ('active', 'rotated', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "organization_tunnel_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_relay_id" uuid,
	"default_ttl_seconds" integer,
	"max_tunnels_per_machine" integer DEFAULT 10 NOT NULL,
	"peer_dns_suffix" text,
	"custom_tunnel_domain" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "peer_metrics" (
	"network_id" uuid NOT NULL,
	"from_endpoint_id" text NOT NULL,
	"to_endpoint_id" text NOT NULL,
	"latency_ms" integer,
	"bytes_tx" bigint DEFAULT 0 NOT NULL,
	"bytes_rx" bigint DEFAULT 0 NOT NULL,
	"packet_loss_bps" integer,
	"direct" boolean,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_metrics_network_id_from_endpoint_id_to_endpoint_id_pk" PRIMARY KEY("network_id","from_endpoint_id","to_endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid,
	"scope" text NOT NULL,
	"src_selector" jsonb NOT NULL,
	"dst_selector" jsonb NOT NULL,
	"action" text NOT NULL,
	"ports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"protocol" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_action_check" CHECK ("policies"."action" IN ('allow', 'deny')),
	CONSTRAINT "policies_scope_check" CHECK ("policies"."scope" IN ('network', 'organization')),
	CONSTRAINT "policies_scope_network_id_check" CHECK (("policies"."scope" = 'organization' AND "policies"."network_id" IS NULL)
          OR ("policies"."scope" = 'network' AND "policies"."network_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "relay_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"relay_id" uuid NOT NULL,
	"active_tunnels" integer DEFAULT 0 NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relay_registration_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"relay_id" uuid NOT NULL,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relays" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'self_hosted' NOT NULL,
	"region" text DEFAULT 'unknown' NOT NULL,
	"public_ip" "inet",
	"domain" text NOT NULL,
	"capacity_limit" integer DEFAULT 100 NOT NULL,
	"active_tunnels" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"last_heartbeat_at" timestamp with time zone,
	"public_key" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relays_organization_name_unique" UNIQUE("organization_id","name"),
	CONSTRAINT "relays_organization_domain_unique" UNIQUE("organization_id","domain"),
	CONSTRAINT "relays_kind_check" CHECK ("relays"."kind" IN ('hosted', 'self_hosted')),
	CONSTRAINT "relays_status_check" CHECK ("relays"."status" IN ('pending', 'healthy', 'degraded', 'offline', 'disabled'))
);
--> statement-breakpoint
CREATE TABLE "serve_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"serve_id" uuid NOT NULL,
	"peer_endpoint_id" text NOT NULL,
	"peer_hostname" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bytes_in" bigint DEFAULT 0 NOT NULL,
	"bytes_out" bigint DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serve_sessions_serve_peer_unique" UNIQUE("serve_id","peer_endpoint_id")
);
--> statement-breakpoint
CREATE TABLE "serves" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"local_port" integer NOT NULL,
	"protocol" text DEFAULT 'https' NOT NULL,
	"internal_hostname" text NOT NULL,
	"status" text DEFAULT 'starting' NOT NULL,
	"access_mode" text DEFAULT 'all_peers' NOT NULL,
	"allowed_tags" text[] DEFAULT '{}' NOT NULL,
	"allowed_endpoint_ids" text[] DEFAULT '{}' NOT NULL,
	"certificate_id" uuid,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "serves_endpoint_port_unique" UNIQUE("endpoint_id","local_port"),
	CONSTRAINT "serves_protocol_check" CHECK ("serves"."protocol" IN ('https', 'tcp')),
	CONSTRAINT "serves_status_check" CHECK ("serves"."status" IN ('starting', 'active', 'error', 'stopped')),
	CONSTRAINT "serves_access_mode_check" CHECK ("serves"."access_mode" IN ('all_peers', 'tags', 'machines')),
	CONSTRAINT "serves_local_port_check" CHECK ("serves"."local_port" > 0 AND "serves"."local_port" <= 65535)
);
--> statement-breakpoint
CREATE TABLE "ssh_auth_challenges" (
	"token" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"dst_endpoint_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proof_token" text,
	"proof_expires_at" timestamp with time zone,
	"proof_consumed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_auth_challenges_status_check" CHECK ("ssh_auth_challenges"."status" IN ('pending', 'completed', 'expired', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "ssh_auth_checks" (
	"endpoint_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"authenticated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"method" text DEFAULT 'oidc' NOT NULL,
	"identity_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_auth_checks_method_check" CHECK ("ssh_auth_checks"."method" IN ('oidc', 'session', 'saml'))
);
--> statement-breakpoint
CREATE TABLE "ssh_policies" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"network_id" uuid NOT NULL,
	"src_selector" jsonb NOT NULL,
	"dst_selector" jsonb NOT NULL,
	"action" text NOT NULL,
	"users" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"record" boolean DEFAULT false NOT NULL,
	"recorder" jsonb,
	"enforce_recorder" boolean DEFAULT false NOT NULL,
	"check_period_secs" integer,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_policies_action_check" CHECK ("ssh_policies"."action" IN ('accept', 'check', 'deny'))
);
--> statement-breakpoint
CREATE TABLE "ssh_recordings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"session_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"recorder_endpoint_id" text NOT NULL,
	"cast_text" text NOT NULL,
	"content_sha256" text NOT NULL,
	"byte_size" integer NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ssh_recordings_session_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "ssh_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"src_endpoint_id" text NOT NULL,
	"dst_endpoint_id" text NOT NULL,
	"src_hostname" text,
	"dst_hostname" text,
	"target_user" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"recorded" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_ms" integer,
	CONSTRAINT "ssh_sessions_status_check" CHECK ("ssh_sessions"."status" IN ('active', 'ended', 'killed'))
);
--> statement-breakpoint
CREATE TABLE "subnet_routes" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"endpoint_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"cidr" "cidr" NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subnet_routes_network_cidr_unique" UNIQUE("network_id","cidr")
);
--> statement-breakpoint
CREATE TABLE "tunnel_request_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status_code" integer NOT NULL,
	"latency_ms" integer NOT NULL,
	"source_ip" text,
	"request_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tunnel_routing_rules" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"tunnel_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"path_pattern" text,
	"external_port" integer,
	"target_endpoint_id" text,
	"target_port" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnel_routing_rules_kind_check" CHECK ("tunnel_routing_rules"."kind" IN ('path', 'port')),
	CONSTRAINT "tunnel_routing_rules_kind_fields_check" CHECK (("tunnel_routing_rules"."kind" = 'path' AND "tunnel_routing_rules"."path_pattern" IS NOT NULL AND "tunnel_routing_rules"."external_port" IS NULL)
          OR ("tunnel_routing_rules"."kind" = 'port' AND "tunnel_routing_rules"."external_port" IS NOT NULL AND "tunnel_routing_rules"."path_pattern" IS NULL)),
	CONSTRAINT "tunnel_routing_rules_target_port_check" CHECK ("tunnel_routing_rules"."target_port" > 0 AND "tunnel_routing_rules"."target_port" <= 65535),
	CONSTRAINT "tunnel_routing_rules_external_port_check" CHECK ("tunnel_routing_rules"."external_port" IS NULL OR ("tunnel_routing_rules"."external_port" > 0 AND "tunnel_routing_rules"."external_port" <= 65535))
);
--> statement-breakpoint
CREATE TABLE "tunnel_secrets" (
	"tunnel_id" uuid PRIMARY KEY NOT NULL,
	"relay_auth_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tunnels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"organization_id" text NOT NULL,
	"network_id" uuid NOT NULL,
	"endpoint_id" text NOT NULL,
	"relay_id" uuid,
	"local_port" integer NOT NULL,
	"protocol" text DEFAULT 'https' NOT NULL,
	"subdomain" text NOT NULL,
	"public_hostname" text NOT NULL,
	"status" text DEFAULT 'connecting' NOT NULL,
	"relay_auth_hash" text,
	"basic_auth_user" text,
	"basic_auth_password_hash" text,
	"error_message" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tunnels_organization_subdomain_unique" UNIQUE("organization_id","subdomain"),
	CONSTRAINT "tunnels_protocol_check" CHECK ("tunnels"."protocol" IN ('https', 'tcp')),
	CONSTRAINT "tunnels_status_check" CHECK ("tunnels"."status" IN ('connecting', 'active', 'error', 'stopped', 'expired')),
	CONSTRAINT "tunnels_local_port_check" CHECK ("tunnels"."local_port" > 0 AND "tunnels"."local_port" <= 65535)
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_refresh_id_oauth_refresh_token_id_fk" FOREIGN KEY ("refresh_id") REFERENCES "public"."oauth_refresh_token"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_presence_events" ADD CONSTRAINT "device_presence_events_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_presence_events" ADD CONSTRAINT "device_presence_events_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_presence_events" ADD CONSTRAINT "device_presence_events_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_profiles" ADD CONSTRAINT "device_profiles_exit_node_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("exit_node_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tags" ADD CONSTRAINT "device_tags_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endpoint_send_settings" ADD CONSTRAINT "endpoint_send_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_tokens" ADD CONSTRAINT "enrollment_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_node_config" ADD CONSTRAINT "exit_node_config_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exit_node_config" ADD CONSTRAINT "exit_node_config_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_transfers" ADD CONSTRAINT "file_transfers_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostname_routes" ADD CONSTRAINT "hostname_routes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hostname_routes" ADD CONSTRAINT "hostname_routes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_certificates" ADD CONSTRAINT "internal_certificates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_certificates" ADD CONSTRAINT "internal_certificates_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_memberships" ADD CONSTRAINT "network_memberships_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_memberships" ADD CONSTRAINT "network_memberships_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "networks" ADD CONSTRAINT "networks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_group_id_node_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."node_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_group_members" ADD CONSTRAINT "node_group_members_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_groups" ADD CONSTRAINT "node_groups_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_groups" ADD CONSTRAINT "node_groups_active_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("active_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_cas" ADD CONSTRAINT "organization_cas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tunnel_settings" ADD CONSTRAINT "organization_tunnel_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_tunnel_settings" ADD CONSTRAINT "organization_tunnel_settings_default_relay_id_relays_id_fk" FOREIGN KEY ("default_relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_from_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("from_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_metrics" ADD CONSTRAINT "peer_metrics_to_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("to_endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_heartbeats" ADD CONSTRAINT "relay_heartbeats_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relay_registration_tokens" ADD CONSTRAINT "relay_registration_tokens_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relays" ADD CONSTRAINT "relays_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serve_sessions" ADD CONSTRAINT "serve_sessions_serve_id_serves_id_fk" FOREIGN KEY ("serve_id") REFERENCES "public"."serves"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serves" ADD CONSTRAINT "serves_certificate_id_internal_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."internal_certificates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_challenges" ADD CONSTRAINT "ssh_auth_challenges_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_challenges" ADD CONSTRAINT "ssh_auth_challenges_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_auth_checks" ADD CONSTRAINT "ssh_auth_checks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_policies" ADD CONSTRAINT "ssh_policies_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_session_id_ssh_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ssh_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_recordings" ADD CONSTRAINT "ssh_recordings_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_sessions" ADD CONSTRAINT "ssh_sessions_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subnet_routes" ADD CONSTRAINT "subnet_routes_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subnet_routes" ADD CONSTRAINT "subnet_routes_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_request_logs" ADD CONSTRAINT "tunnel_request_logs_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_request_logs" ADD CONSTRAINT "tunnel_request_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_routing_rules" ADD CONSTRAINT "tunnel_routing_rules_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_routing_rules" ADD CONSTRAINT "tunnel_routing_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnel_secrets" ADD CONSTRAINT "tunnel_secrets_tunnel_id_tunnels_id_fk" FOREIGN KEY ("tunnel_id") REFERENCES "public"."tunnels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_network_id_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_endpoint_id_devices_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."devices"("endpoint_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tunnels" ADD CONSTRAINT "tunnels_relay_id_relays_id_fk" FOREIGN KEY ("relay_id") REFERENCES "public"."relays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "device_code_device_code_idx" ON "device_code" USING btree ("device_code");--> statement-breakpoint
CREATE INDEX "device_code_user_code_idx" ON "device_code" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "invitation_organization_id_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organization_id_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_id_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_client_id_idx" ON "oauth_access_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_session_id_idx" ON "oauth_access_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_id_idx" ON "oauth_access_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_access_token_refresh_id_idx" ON "oauth_access_token" USING btree ("refresh_id");--> statement-breakpoint
CREATE INDEX "oauth_client_user_id_idx" ON "oauth_client" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_client_reference_id_idx" ON "oauth_client" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_client_id_idx" ON "oauth_consent" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_id_idx" ON "oauth_consent" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_client_id_idx" ON "oauth_refresh_token" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_session_id_idx" ON "oauth_refresh_token" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_id_idx" ON "oauth_refresh_token" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "organization_slug_idx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_active_organization_id_idx" ON "session" USING btree ("active_organization_id");--> statement-breakpoint
CREATE INDEX "sso_provider_organization_id_idx" ON "sso_provider" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sso_provider_provider_id_idx" ON "sso_provider" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "audit_log_by_organization_at_idx" ON "audit_log" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_by_organization_actor_idx" ON "audit_log" USING btree ("organization_id","actor");--> statement-breakpoint
CREATE INDEX "device_presence_events_by_endpoint_at_idx" ON "device_presence_events" USING btree ("endpoint_id","at");--> statement-breakpoint
CREATE INDEX "device_presence_events_by_organization_at_idx" ON "device_presence_events" USING btree ("organization_id","at");--> statement-breakpoint
CREATE INDEX "device_profiles_by_network_idx" ON "device_profiles" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "devices_by_organization_idx" ON "devices" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "devices_by_last_seen_idx" ON "devices" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "devices_by_agent_connected_idx" ON "devices" USING btree ("agent_connected");--> statement-breakpoint
CREATE INDEX "endpoint_send_settings_by_org_idx" ON "endpoint_send_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "enrollment_tokens_by_expires_at_idx" ON "enrollment_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "exit_node_config_by_network_enabled_idx" ON "exit_node_config" USING btree ("network_id","enabled");--> statement-breakpoint
CREATE INDEX "file_transfers_by_org_created_idx" ON "file_transfers" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "file_transfers_by_network_created_idx" ON "file_transfers" USING btree ("network_id","created_at");--> statement-breakpoint
CREATE INDEX "file_transfers_by_status_idx" ON "file_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "file_transfers_by_sender_idx" ON "file_transfers" USING btree ("sender_endpoint_id");--> statement-breakpoint
CREATE INDEX "file_transfers_by_receiver_idx" ON "file_transfers" USING btree ("receiver_endpoint_id");--> statement-breakpoint
CREATE INDEX "hostname_routes_by_endpoint_idx" ON "hostname_routes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "hostname_routes_by_network_enabled_idx" ON "hostname_routes" USING btree ("network_id","enabled");--> statement-breakpoint
CREATE INDEX "internal_certificates_by_organization_idx" ON "internal_certificates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "internal_certificates_by_endpoint_idx" ON "internal_certificates" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "network_memberships_by_network_idx" ON "network_memberships" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "network_memberships_by_last_seen_idx" ON "network_memberships" USING btree ("last_seen");--> statement-breakpoint
CREATE INDEX "node_group_members_by_endpoint_idx" ON "node_group_members" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "node_groups_by_network_idx" ON "node_groups" USING btree ("network_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_cas_one_active_per_org" ON "organization_cas" USING btree ("organization_id") WHERE "organization_cas"."status" = 'active';--> statement-breakpoint
CREATE INDEX "organization_cas_by_organization_idx" ON "organization_cas" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "peer_metrics_by_network_updated_idx" ON "peer_metrics" USING btree ("network_id","updated_at");--> statement-breakpoint
CREATE INDEX "policies_by_org_priority_idx" ON "policies" USING btree ("organization_id","priority");--> statement-breakpoint
CREATE INDEX "policies_by_network_priority_idx" ON "policies" USING btree ("network_id","priority") WHERE "policies"."network_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "relay_heartbeats_by_relay_recorded_idx" ON "relay_heartbeats" USING btree ("relay_id","recorded_at");--> statement-breakpoint
CREATE INDEX "relay_registration_tokens_by_expires_at_idx" ON "relay_registration_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "relays_by_organization_status_idx" ON "relays" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "serve_sessions_by_serve_idx" ON "serve_sessions" USING btree ("serve_id");--> statement-breakpoint
CREATE INDEX "serve_sessions_by_serve_last_seen_idx" ON "serve_sessions" USING btree ("serve_id","last_seen_at");--> statement-breakpoint
CREATE INDEX "serves_by_organization_idx" ON "serves" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "serves_by_endpoint_idx" ON "serves" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "serves_by_network_status_idx" ON "serves" USING btree ("network_id","status");--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_endpoint_idx" ON "ssh_auth_challenges" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_proof_idx" ON "ssh_auth_challenges" USING btree ("proof_token");--> statement-breakpoint
CREATE INDEX "ssh_auth_challenges_by_expires_at_idx" ON "ssh_auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "ssh_auth_checks_by_org_idx" ON "ssh_auth_checks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ssh_policies_by_network_priority_idx" ON "ssh_policies" USING btree ("network_id","priority");--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_session_idx" ON "ssh_recordings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_org_created_idx" ON "ssh_recordings" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ssh_recordings_by_network_created_idx" ON "ssh_recordings" USING btree ("network_id","created_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_org_started_idx" ON "ssh_sessions" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_network_started_idx" ON "ssh_sessions" USING btree ("network_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_dst_started_idx" ON "ssh_sessions" USING btree ("dst_endpoint_id","started_at");--> statement-breakpoint
CREATE INDEX "ssh_sessions_by_status_idx" ON "ssh_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subnet_routes_by_endpoint_idx" ON "subnet_routes" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "subnet_routes_by_network_enabled_idx" ON "subnet_routes" USING btree ("network_id","enabled");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_tunnel_created_idx" ON "tunnel_request_logs" USING btree ("tunnel_id","created_at");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_organization_created_idx" ON "tunnel_request_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "tunnel_request_logs_by_created_idx" ON "tunnel_request_logs" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tunnel_routing_rules_tunnel_path_unique" ON "tunnel_routing_rules" USING btree ("tunnel_id","path_pattern") WHERE "tunnel_routing_rules"."kind" = 'path';--> statement-breakpoint
CREATE UNIQUE INDEX "tunnel_routing_rules_tunnel_port_unique" ON "tunnel_routing_rules" USING btree ("tunnel_id","external_port") WHERE "tunnel_routing_rules"."kind" = 'port';--> statement-breakpoint
CREATE INDEX "tunnel_routing_rules_by_tunnel_priority_idx" ON "tunnel_routing_rules" USING btree ("tunnel_id","priority");--> statement-breakpoint
CREATE INDEX "tunnel_routing_rules_by_organization_idx" ON "tunnel_routing_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_organization_idx" ON "tunnels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_network_idx" ON "tunnels" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_endpoint_idx" ON "tunnels" USING btree ("endpoint_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_relay_idx" ON "tunnels" USING btree ("relay_id");--> statement-breakpoint
CREATE INDEX "tunnels_by_status_idx" ON "tunnels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tunnels_by_expires_at_idx" ON "tunnels" USING btree ("expires_at");