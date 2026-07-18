package resources

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/diag"
	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	tunnet "github.com/tunnetio/tunnet-go"
)

var (
	_ resource.Resource                = (*deviceGroupResource)(nil)
	_ resource.ResourceWithConfigure   = (*deviceGroupResource)(nil)
	_ resource.ResourceWithImportState = (*deviceGroupResource)(nil)
	_ resource.ResourceWithIdentity    = (*deviceGroupResource)(nil)
)

type deviceGroupResource struct {
	client *tunnet.Client
}

type deviceGroupModel struct {
	ID          types.String `tfsdk:"id"`
	Name        types.String `tfsdk:"name"`
	NetworkID   types.String `tfsdk:"network_id"`
	Description types.String `tfsdk:"description"`
	Labels      types.Map    `tfsdk:"labels"`
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
				Computed:    true,
				Description: "Device group ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Device group name.",
			},
			"network_id": schema.StringAttribute{
				Optional:    true,
				Description: "Optional network scope for the device group.",
			},
			"description": schema.StringAttribute{
				Optional:    true,
				Description: "Device group description.",
			},
			"labels": schema.MapAttribute{
				Optional:    true,
				ElementType: types.StringType,
				Description: "Optional labels.",
			},
		},
	}
}

func (r *deviceGroupResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *deviceGroupResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *deviceGroupResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
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

	labels, diags := mapFromTerraform(ctx, plan.Labels)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	group, err := r.client.CreateDeviceGroup(ctx, tunnet.CreateDeviceGroupInput{
		Name:        plan.Name.ValueString(),
		NetworkID:   plan.NetworkID.ValueString(),
		Description: plan.Description.ValueString(),
		Labels:      labels,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create device group", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setDeviceGroupState(ctx, &plan, group)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, group.ID)...)
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

	group, err := r.client.GetDeviceGroup(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read device group", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setDeviceGroupState(ctx, &state, group)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, group.ID)...)
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
	labels, diags := mapFromTerraform(ctx, plan.Labels)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	group, err := r.client.UpdateDeviceGroup(ctx, plan.ID.ValueString(), tunnet.UpdateDeviceGroupInput{
		Name:        &name,
		NetworkID:   &networkID,
		Description: &description,
		Labels:      labels,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update device group", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setDeviceGroupState(ctx, &plan, group)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, group.ID)...)
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

func setDeviceGroupState(ctx context.Context, model *deviceGroupModel, group *tunnet.DeviceGroup) diag.Diagnostics {
	var diags diag.Diagnostics
	model.ID = types.StringValue(group.ID)
	model.Name = types.StringValue(group.Name)
	if group.NetworkID == "" {
		model.NetworkID = types.StringNull()
	} else {
		model.NetworkID = types.StringValue(group.NetworkID)
	}
	if group.Description == "" {
		model.Description = types.StringNull()
	} else {
		model.Description = types.StringValue(group.Description)
	}
	labels, labelDiags := mapToTerraform(ctx, group.Labels)
	diags.Append(labelDiags...)
	model.Labels = labels
	return diags
}
