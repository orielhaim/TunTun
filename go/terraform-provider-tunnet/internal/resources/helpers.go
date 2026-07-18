package resources

import (
	"context"
	"fmt"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	tunnet "github.com/tunnetio/tunnet-go"
)

func clientFromResource(ctx context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) *tunnet.Client {
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

func notImplementedDiag(operation, resourceName string) diag.Diagnostics {
	return diag.Diagnostics{diag.NewErrorDiagnostic(
		"Not implemented",
		fmt.Sprintf("%s for %s is not implemented yet in the Tunnet SDK", operation, resourceName),
	)}
}

func sdkErrorDiag(operation string, err error) diag.Diagnostics {
	if err == nil {
		return nil
	}
	return diag.Diagnostics{diag.NewErrorDiagnostic(
		fmt.Sprintf("Tunnet API %s failed", operation),
		err.Error(),
	)}
}
