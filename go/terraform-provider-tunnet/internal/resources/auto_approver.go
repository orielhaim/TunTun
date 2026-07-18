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

var _ resource.Resource = (*autoApproverResource)(nil)

type autoApproverResource struct{ client *tunnet.Client }

type autoApproverModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewAutoApproverResource() resource.Resource { return &autoApproverResource{} }

func (r *autoApproverResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_auto_approver"
}

func (r *autoApproverResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"name": schema.StringAttribute{Required: true},
		},
	}
}

func (r *autoApproverResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *autoApproverResource) Create(ctx context.Context, _ resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}
	_, err := r.client.CreateAutoApprover(ctx, tunnet.AutoApprover{})
	resp.Diagnostics.Append(sdkErrorDiag("create auto approver", err)...)
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
	_, err := r.client.GetAutoApprover(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("read auto approver", err)...)
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
	_, err := r.client.UpdateAutoApprover(ctx, plan.ID.ValueString(), tunnet.AutoApprover{})
	resp.Diagnostics.Append(sdkErrorDiag("update auto approver", err)...)
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
