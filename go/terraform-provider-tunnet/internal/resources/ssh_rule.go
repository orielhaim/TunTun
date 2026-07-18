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
	_ resource.Resource                = (*sshRuleResource)(nil)
	_ resource.ResourceWithConfigure   = (*sshRuleResource)(nil)
	_ resource.ResourceWithImportState = (*sshRuleResource)(nil)
	_ resource.ResourceWithIdentity    = (*sshRuleResource)(nil)
)

type sshRuleResource struct {
	client *tunnet.Client
}

type sshRuleModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewSSHRuleResource() resource.Resource {
	return &sshRuleResource{}
}

func (r *sshRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_ssh_rule"
}

func (r *sshRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet SSH rule.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "SSH rule ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "SSH rule name.",
			},
		},
	}
}

func (r *sshRuleResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *sshRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *sshRuleResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *sshRuleResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan sshRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.CreateSSHRule(ctx, tunnet.SSHRule{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create ssh rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setSSHRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *sshRuleResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state sshRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.GetSSHRule(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read ssh rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setSSHRuleState(&state, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *sshRuleResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan sshRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.UpdateSSHRule(ctx, plan.ID.ValueString(), tunnet.SSHRule{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update ssh rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setSSHRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *sshRuleResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state sshRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteSSHRule(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete ssh rule", err)...)
}

func setSSHRuleState(model *sshRuleModel, rule *tunnet.SSHRule) diag.Diagnostics {
	model.ID = types.StringValue(rule.ID)
	model.Name = types.StringValue(rule.Name)
	return nil
}
