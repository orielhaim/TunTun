package resources

import (
	"context"
	"testing"

	"github.com/hashicorp/terraform-plugin-framework/types"
)

func TestMapFromTerraform(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	value, diags := types.MapValueFrom(ctx, types.StringType, map[string]string{"env": "prod"})
	if diags.HasError() {
		t.Fatalf("MapValueFrom: %v", diags)
	}

	got, diags := mapFromTerraform(ctx, value)
	if diags.HasError() {
		t.Fatalf("mapFromTerraform: %v", diags)
	}
	if got["env"] != "prod" {
		t.Fatalf("expected env=prod, got %#v", got)
	}

	nullGot, diags := mapFromTerraform(ctx, types.MapNull(types.StringType))
	if diags.HasError() {
		t.Fatalf("mapFromTerraform null: %v", diags)
	}
	if nullGot != nil {
		t.Fatalf("expected nil for null map, got %#v", nullGot)
	}
}

func TestMapToTerraform(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	value, diags := mapToTerraform(ctx, map[string]string{"team": "net"})
	if diags.HasError() {
		t.Fatalf("mapToTerraform: %v", diags)
	}
	if value.IsNull() {
		t.Fatal("expected non-null map")
	}

	empty, diags := mapToTerraform(ctx, nil)
	if diags.HasError() {
		t.Fatalf("mapToTerraform empty: %v", diags)
	}
	if !empty.IsNull() {
		t.Fatal("expected null map for empty input")
	}
}

func TestSetRoundTrip(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	input, diags := types.SetValueFrom(ctx, types.StringType, []string{"a", "b"})
	if diags.HasError() {
		t.Fatalf("SetValueFrom: %v", diags)
	}

	got, diags := setFromTerraform(ctx, input)
	if diags.HasError() {
		t.Fatalf("setFromTerraform: %v", diags)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 elements, got %#v", got)
	}

	back, diags := setToTerraform(ctx, got)
	if diags.HasError() {
		t.Fatalf("setToTerraform: %v", diags)
	}
	if back.IsNull() {
		t.Fatal("expected non-null set")
	}
}
