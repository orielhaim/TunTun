package datasources

import (
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/diag"
	tunnet "github.com/tunnetio/tunnet-go"
)

func clientFromDataSource(req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) *tunnet.Client {
	if req.ProviderData == nil {
		resp.Diagnostics.AddError(
			"Unconfigured provider",
			"The Tunnet provider was not configured. Configure api_url, api_key, and organization_id.",
		)
		return nil
	}

	client, ok := req.ProviderData.(*tunnet.Client)
	if !ok {
		resp.Diagnostics.AddError(
			"Unexpected provider data",
			fmt.Sprintf("Expected *tunnet.Client, got %T", req.ProviderData),
		)
		return nil
	}

	return client
}

func notImplementedDiag(operation, dataSourceName string) diag.Diagnostics {
	return diag.Diagnostics{diag.NewErrorDiagnostic(
		"Not implemented",
		fmt.Sprintf("%s for %s is not implemented yet in the Tunnet SDK", operation, dataSourceName),
	)}
}
