package provider

import (
	"context"
	"os"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/provider/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/types"
	"github.com/hashicorp/terraform-plugin-log/tflog"
	"github.com/tunnetio/terraform-provider-tunnet/internal/datasources"
	"github.com/tunnetio/terraform-provider-tunnet/internal/resources"
	tunnet "github.com/tunnetio/tunnet-go"
)

const (
	envAPIURL            = "TUNNET_API_URL"
	envAPIKey            = "TUNNET_API_KEY"
	envOrganizationID    = "TUNNET_ORGANIZATION_ID"
	envNetworkID         = "TUNNET_NETWORK_ID"
	envOAuthClientID     = "TUNNET_OAUTH_CLIENT_ID"
	envOAuthClientSecret = "TUNNET_OAUTH_CLIENT_SECRET"
)

var _ provider.Provider = (*tunnetProvider)(nil)

type tunnetProvider struct {
	version string
}

// New returns a new Tunnet provider factory.
func New(version string) func() provider.Provider {
	return func() provider.Provider {
		return &tunnetProvider{version: version}
	}
}

type tunnetProviderModel struct {
	APIURL            types.String `tfsdk:"api_url"`
	APIKey            types.String `tfsdk:"api_key"`
	OrganizationID    types.String `tfsdk:"organization_id"`
	NetworkID         types.String `tfsdk:"network_id"`
	OAuthClientID     types.String `tfsdk:"oauth_client_id"`
	OAuthClientSecret types.String `tfsdk:"oauth_client_secret"`
}

func (p *tunnetProvider) Metadata(_ context.Context, _ provider.MetadataRequest, resp *provider.MetadataResponse) {
	resp.TypeName = "tunnet"
	resp.Version = p.version
}

func (p *tunnetProvider) Schema(_ context.Context, _ provider.SchemaRequest, resp *provider.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Interact with Tunnet policy and network resources.",
		Attributes: map[string]schema.Attribute{
			"api_url": schema.StringAttribute{
				Description: "Tunnet Management API base URL. May also be set via TUNNET_API_URL.",
				Optional:    true,
			},
			"api_key": schema.StringAttribute{
				Description: "Tunnet API key with management scopes. May also be set via TUNNET_API_KEY. Mutually exclusive with OAuth client credentials when both are unset from env.",
				Optional:    true,
				Sensitive:   true,
			},
			"organization_id": schema.StringAttribute{
				Description: "Tunnet organization ID. May also be set via TUNNET_ORGANIZATION_ID.",
				Optional:    true,
			},
			"network_id": schema.StringAttribute{
				Description: "Default network ID for network-scoped resources. May also be set via TUNNET_NETWORK_ID.",
				Optional:    true,
			},
			"oauth_client_id": schema.StringAttribute{
				Description: "OAuth2 client ID for client credentials flow. May also be set via TUNNET_OAUTH_CLIENT_ID.",
				Optional:    true,
			},
			"oauth_client_secret": schema.StringAttribute{
				Description: "OAuth2 client secret for client credentials flow. May also be set via TUNNET_OAUTH_CLIENT_SECRET.",
				Optional:    true,
				Sensitive:   true,
			},
		},
	}
}

func (p *tunnetProvider) Configure(ctx context.Context, req provider.ConfigureRequest, resp *provider.ConfigureResponse) {
	var config tunnetProviderModel
	diags := req.Config.Get(ctx, &config)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	apiURL := firstNonEmpty(config.APIURL.ValueString(), os.Getenv(envAPIURL), tunnet.DefaultAPIURL)
	apiKey := firstNonEmpty(config.APIKey.ValueString(), os.Getenv(envAPIKey))
	organizationID := firstNonEmpty(config.OrganizationID.ValueString(), os.Getenv(envOrganizationID))
	networkID := firstNonEmpty(config.NetworkID.ValueString(), os.Getenv(envNetworkID))
	oauthClientID := firstNonEmpty(config.OAuthClientID.ValueString(), os.Getenv(envOAuthClientID))
	oauthClientSecret := firstNonEmpty(config.OAuthClientSecret.ValueString(), os.Getenv(envOAuthClientSecret))

	if apiKey == "" && (oauthClientID == "" || oauthClientSecret == "") {
		resp.Diagnostics.AddError(
			"Missing credentials",
			"Set api_key (or TUNNET_API_KEY), or both oauth_client_id and oauth_client_secret (or TUNNET_OAUTH_CLIENT_ID / TUNNET_OAUTH_CLIENT_SECRET).",
		)
	}

	if organizationID == "" {
		resp.Diagnostics.AddError(
			"Missing organization ID",
			"Set organization_id in the provider configuration or TUNNET_ORGANIZATION_ID in the environment.",
		)
	}

	if resp.Diagnostics.HasError() {
		return
	}

	client, err := tunnet.NewClient(tunnet.ClientConfig{
		BaseURL:           apiURL,
		APIKey:            apiKey,
		OrganizationID:    organizationID,
		NetworkID:         networkID,
		OAuthClientID:     oauthClientID,
		OAuthClientSecret: oauthClientSecret,
	})
	if err != nil {
		resp.Diagnostics.AddError("Client configuration error", err.Error())
		return
	}

	tflog.Info(ctx, "Configured Tunnet client", map[string]any{
		"api_url":         apiURL,
		"organization_id": organizationID,
		"network_id":      networkID,
		"auth":            authMode(apiKey, oauthClientID),
	})

	// Populate all consumer slots introduced in newer framework versions.
	resp.DataSourceData = client
	resp.ResourceData = client
	resp.ActionData = client
	resp.ListResourceData = client
	resp.StateStoreData = client
}

func (p *tunnetProvider) Resources(_ context.Context) []func() resource.Resource {
	return []func() resource.Resource{
		resources.NewUserGroupResource,
		resources.NewDeviceGroupResource,
		resources.NewTagResource,
		resources.NewHostAliasResource,
		resources.NewIPSetResource,
		resources.NewACLRuleResource,
		resources.NewGrantResource,
		resources.NewSSHRuleResource,
		resources.NewPostureRuleResource,
		resources.NewAutoApproverResource,
		resources.NewAuthKeyResource,
		resources.NewPolicyDocumentResource,
	}
}

func (p *tunnetProvider) DataSources(_ context.Context) []func() datasource.DataSource {
	return []func() datasource.DataSource{
		datasources.NewDeviceDataSource,
		datasources.NewDevicesDataSource,
		datasources.NewNetworkDataSource,
		datasources.NewUserDataSource,
		datasources.NewPolicyDocumentDataSource,
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func authMode(apiKey, oauthClientID string) string {
	if apiKey != "" {
		return "api_key"
	}
	if oauthClientID != "" {
		return "oauth_client_credentials"
	}
	return "unknown"
}
