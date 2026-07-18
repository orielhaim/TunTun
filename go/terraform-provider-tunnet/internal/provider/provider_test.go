package provider_test

import (
	"context"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/provider"
	"github.com/hashicorp/terraform-plugin-framework/providerserver"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-go/tfprotov6"
	providerpkg "github.com/tunnetio/terraform-provider-tunnet/internal/provider"
)

func TestProviderMetadata(t *testing.T) {
	t.Parallel()

	p := providerpkg.New("test")()
	var resp provider.MetadataResponse
	p.Metadata(context.Background(), provider.MetadataRequest{}, &resp)

	if resp.TypeName != "tunnet" {
		t.Fatalf("expected type name tunnet, got %q", resp.TypeName)
	}
	if resp.Version != "test" {
		t.Fatalf("expected version test, got %q", resp.Version)
	}
}

func TestProviderSchema(t *testing.T) {
	t.Parallel()

	p := providerpkg.New("test")()
	var resp provider.SchemaResponse
	p.Schema(context.Background(), provider.SchemaRequest{}, &resp)
	if resp.Diagnostics.HasError() {
		t.Fatalf("schema diagnostics: %v", resp.Diagnostics)
	}

	attrs := resp.Schema.Attributes
	for _, name := range []string{"api_url", "api_key", "organization_id", "network_id", "oauth_client_id", "oauth_client_secret"} {
		if _, ok := attrs[name]; !ok {
			t.Fatalf("missing provider attribute %q", name)
		}
	}
}

func TestProviderResourceRegistration(t *testing.T) {
	t.Parallel()

	p := providerpkg.New("test")()
	factories := p.Resources(context.Background())
	if len(factories) != 12 {
		t.Fatalf("expected 12 resources, got %d", len(factories))
	}

	names := make(map[string]struct{}, len(factories))
	for _, factory := range factories {
		r := factory()
		var meta resource.MetadataResponse
		r.Metadata(context.Background(), resource.MetadataRequest{ProviderTypeName: "tunnet"}, &meta)
		names[meta.TypeName] = struct{}{}

		if _, ok := r.(resource.ResourceWithIdentity); !ok {
			t.Fatalf("%s missing ResourceWithIdentity", meta.TypeName)
		}
		if _, ok := r.(resource.ResourceWithImportState); !ok {
			t.Fatalf("%s missing ResourceWithImportState", meta.TypeName)
		}
	}

	for _, want := range []string{
		"tunnet_user_group",
		"tunnet_device_group",
		"tunnet_tag",
		"tunnet_host_alias",
		"tunnet_ip_set",
		"tunnet_acl_rule",
		"tunnet_grant",
		"tunnet_ssh_rule",
		"tunnet_posture_rule",
		"tunnet_auto_approver",
		"tunnet_auth_key",
		"tunnet_policy_document",
	} {
		if _, ok := names[want]; !ok {
			t.Fatalf("missing resource %q", want)
		}
	}
}

func TestProviderDataSourceRegistration(t *testing.T) {
	t.Parallel()

	p := providerpkg.New("test")()
	factories := p.DataSources(context.Background())
	if len(factories) != 5 {
		t.Fatalf("expected 5 data sources, got %d", len(factories))
	}

	names := make(map[string]struct{}, len(factories))
	for _, factory := range factories {
		d := factory()
		var meta datasource.MetadataResponse
		d.Metadata(context.Background(), datasource.MetadataRequest{ProviderTypeName: "tunnet"}, &meta)
		names[meta.TypeName] = struct{}{}
	}

	for _, want := range []string{
		"tunnet_device",
		"tunnet_devices",
		"tunnet_network",
		"tunnet_user",
		"tunnet_policy_document",
	} {
		if _, ok := names[want]; !ok {
			t.Fatalf("missing data source %q", want)
		}
	}
}

func TestProviderServerFactory(t *testing.T) {
	t.Parallel()

	factory := providerserver.NewProtocol6WithError(providerpkg.New("test")())
	server, err := factory()
	if err != nil {
		t.Fatalf("NewProtocol6WithError: %v", err)
	}
	var _ tfprotov6.ProviderServer = server
}
