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
	_ resource.Resource                = (*autoApproverResource)(nil)
	_ resource.ResourceWithConfigure   = (*autoApproverResource)(nil)
	_ resource.ResourceWithImportState = (*autoApproverResource)(nil)
	_ resource.ResourceWithIdentity    = (*autoApproverResource)(nil)
)

type autoApproverResource struct {
	client *tunnet.Client
}

type autoApproverModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewAutoApproverResource() resource.Resource {
	return &autoApproverResource{}
}

func (r *autoApproverResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_auto_approver"
}

func (r *autoApproverResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet auto approver.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Auto approver ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Auto approver name.",
			},
		},
	}
}

func (r *autoApproverResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *autoApproverResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *autoApproverResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *autoApproverResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan autoApproverModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	approver, err := r.client.CreateAutoApprover(ctx, tunnet.AutoApprover{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create auto approver", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setAutoApproverState(&plan, approver)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, approver.ID)...)
}

func (r *autoApproverResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state autoApproverModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	approver, err := r.client.GetAutoApprover(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read auto approver", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setAutoApproverState(&state, approver)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, approver.ID)...)
}

func (r *autoApproverResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan autoApproverModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	approver, err := r.client.UpdateAutoApprover(ctx, plan.ID.ValueString(), tunnet.AutoApprover{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update auto approver", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setAutoApproverState(&plan, approver)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, approver.ID)...)
}

func (r *autoApproverResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state autoApproverModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteAutoApprover(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete auto approver", err)...)
}

func setAutoApproverState(model *autoApproverModel, approver *tunnet.AutoApprover) diag.Diagnostics {
	model.ID = types.StringValue(approver.ID)
	model.Name = types.StringValue(approver.Name)
	return nil
}
