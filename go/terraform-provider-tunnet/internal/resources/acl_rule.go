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

var _ resource.Resource = (*aclRuleResource)(nil)

type aclRuleResource struct{ client *tunnet.Client }

type aclRuleModel struct {
	ID     types.String `tfsdk:"id"`
	Name   types.String `tfsdk:"name"`
	Action types.String `tfsdk:"action"`
}

func NewACLRuleResource() resource.Resource { return &aclRuleResource{} }

func (r *aclRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_acl_rule"
}

func (r *aclRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"name":   schema.StringAttribute{Required: true},
			"action": schema.StringAttribute{Required: true},
		},
	}
}

func (r *aclRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *aclRuleResource) Create(ctx context.Context, _ resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}
	_, err := r.client.CreateACLRule(ctx, tunnet.ACLRule{})
	resp.Diagnostics.Append(sdkErrorDiag("create acl rule", err)...)
}

func (r *aclRuleResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}
	var state aclRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.GetACLRule(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("read acl rule", err)...)
}

func (r *aclRuleResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}
	var plan aclRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}
	_, err := r.client.UpdateACLRule(ctx, plan.ID.ValueString(), tunnet.ACLRule{})
	resp.Diagnostics.Append(sdkErrorDiag("update acl rule", err)...)
}

func (r *aclRuleResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}
	var state aclRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}
	err := r.client.DeleteACLRule(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete acl rule", err)...)
}
