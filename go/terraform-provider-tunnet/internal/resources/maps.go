package resources

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/types"
)

func mapFromTerraform(ctx context.Context, value types.Map) (map[string]string, diag.Diagnostics) {
	if value.IsNull() || value.IsUnknown() {
		return nil, nil
	}

	result := make(map[string]string, len(value.Elements()))
	diags := value.ElementsAs(ctx, &result, false)
	return result, diags
}

func mapToTerraform(ctx context.Context, value map[string]string) (types.Map, diag.Diagnostics) {
	if len(value) == 0 {
		return types.MapNull(types.StringType), diag.Diagnostics{}
	}
	return types.MapValueFrom(ctx, types.StringType, value)
}

func setFromTerraform(ctx context.Context, value types.Set) ([]string, diag.Diagnostics) {
	if value.IsNull() || value.IsUnknown() {
		return nil, nil
	}

	var result []string
	diags := value.ElementsAs(ctx, &result, false)
	return result, diags
}

func setToTerraform(ctx context.Context, value []string) (types.Set, diag.Diagnostics) {
	if len(value) == 0 {
		return types.SetNull(types.StringType), diag.Diagnostics{}
	}
	return types.SetValueFrom(ctx, types.StringType, value)
}
