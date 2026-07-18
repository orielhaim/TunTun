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
	_ resource.Resource                = (*aclRuleResource)(nil)
	_ resource.ResourceWithConfigure   = (*aclRuleResource)(nil)
	_ resource.ResourceWithImportState = (*aclRuleResource)(nil)
	_ resource.ResourceWithIdentity    = (*aclRuleResource)(nil)
)

type aclRuleResource struct {
	client *tunnet.Client
}

type aclRuleModel struct {
	ID     types.String `tfsdk:"id"`
	Name   types.String `tfsdk:"name"`
	Action types.String `tfsdk:"action"`
}

func NewACLRuleResource() resource.Resource {
	return &aclRuleResource{}
}

func (r *aclRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_acl_rule"
}

func (r *aclRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet ACL rule.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "ACL rule ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "ACL rule name.",
			},
			"action": schema.StringAttribute{
				Required:    true,
				Description: "Rule action (for example allow or deny).",
			},
		},
	}
}

func (r *aclRuleResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *aclRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *aclRuleResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *aclRuleResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan aclRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.CreateACLRule(ctx, tunnet.ACLRule{
		Name:   plan.Name.ValueString(),
		Action: plan.Action.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create acl rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setACLRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
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

	rule, err := r.client.GetACLRule(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read acl rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setACLRuleState(&state, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
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

	rule, err := r.client.UpdateACLRule(ctx, plan.ID.ValueString(), tunnet.ACLRule{
		Name:   plan.Name.ValueString(),
		Action: plan.Action.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update acl rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setACLRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
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

func setACLRuleState(model *aclRuleModel, rule *tunnet.ACLRule) diag.Diagnostics {
	model.ID = types.StringValue(rule.ID)
	model.Name = types.StringValue(rule.Name)
	model.Action = types.StringValue(rule.Action)
	return nil
}
