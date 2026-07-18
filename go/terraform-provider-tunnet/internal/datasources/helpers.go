package datasources

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/diag"
)

func clientFromDataSource(ctx context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) interface{} {
	if req.ProviderData == nil {
		resp.Diagnostics.AddError(
			"Unconfigured provider",
			"The Tunnet provider was not configured. Configure api_url, api_key, and organization_id.",
		)
		return nil
	}
	return req.ProviderData
}

func notImplementedDiag(operation, dataSourceName string) diag.Diagnostics {
	return diag.Diagnostics{diag.NewErrorDiagnostic(
		"Not implemented",
		fmt.Sprintf("%s for %s is not implemented yet in the Tunnet SDK", operation, dataSourceName),
	)}
}
