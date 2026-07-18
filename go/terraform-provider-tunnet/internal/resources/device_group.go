package resources

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	tunnet "github.com/tunnetio/tunnet-go"
)

var _ resource.Resource = (*deviceGroupResource)(nil)

type deviceGroupResource struct {
	client *tunnet.Client
}

type deviceGroupModel struct {
	ID          types.String `tfsdk:"id"`
	Name        types.String `tfsdk:"name"`
	NetworkID   types.String `tfsdk:"network_id"`
	Description types.String `tfsdk:"description"`
}

func NewDeviceGroupResource() resource.Resource {
	return &deviceGroupResource{}
}

func (r *deviceGroupResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_device_group"
}

func (r *deviceGroupResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet device group.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name":        schema.StringAttribute{Required: true},
			"network_id":  schema.StringAttribute{Optional: true},
			"description": schema.StringAttribute{Optional: true},
		},
	}
}

func (r *deviceGroupResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *deviceGroupResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}
	var plan deviceGroupModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.CreateDeviceGroup(ctx, tunnet.CreateDeviceGroupInput{
		Name:        plan.Name.ValueString(),
		NetworkID:   plan.NetworkID.ValueString(),
		Description: plan.Description.ValueString(),
	})
	resp.Diagnostics.Append(sdkErrorDiag("create device group", err)...)
}

func (r *deviceGroupResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}
	var state deviceGroupModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.GetDeviceGroup(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("read device group", err)...)
}

func (r *deviceGroupResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}
	var plan deviceGroupModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	name := plan.Name.ValueString()
	networkID := plan.NetworkID.ValueString()
	description := plan.Description.ValueString()
	_, err := r.client.UpdateDeviceGroup(ctx, plan.ID.ValueString(), tunnet.UpdateDeviceGroupInput{
		Name:        &name,
		NetworkID:   &networkID,
		Description: &description,
	})
	resp.Diagnostics.Append(sdkErrorDiag("update device group", err)...)
}

func (r *deviceGroupResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}
	var state deviceGroupModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.DeleteDeviceGroup(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete device group", err)...)
}
