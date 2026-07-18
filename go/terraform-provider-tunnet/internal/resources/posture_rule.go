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
	_ resource.Resource                = (*postureRuleResource)(nil)
	_ resource.ResourceWithConfigure   = (*postureRuleResource)(nil)
	_ resource.ResourceWithImportState = (*postureRuleResource)(nil)
	_ resource.ResourceWithIdentity    = (*postureRuleResource)(nil)
)

type postureRuleResource struct {
	client *tunnet.Client
}

type postureRuleModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewPostureRuleResource() resource.Resource {
	return &postureRuleResource{}
}

func (r *postureRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_posture_rule"
}

func (r *postureRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet posture rule.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Posture rule ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Posture rule name.",
			},
		},
	}
}

func (r *postureRuleResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *postureRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *postureRuleResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *postureRuleResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan postureRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.CreatePostureRule(ctx, tunnet.PostureRule{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create posture rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setPostureRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *postureRuleResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state postureRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.GetPostureRule(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read posture rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setPostureRuleState(&state, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *postureRuleResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan postureRuleModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	rule, err := r.client.UpdatePostureRule(ctx, plan.ID.ValueString(), tunnet.PostureRule{
		Name: plan.Name.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update posture rule", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setPostureRuleState(&plan, rule)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, rule.ID)...)
}

func (r *postureRuleResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state postureRuleModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeletePostureRule(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete posture rule", err)...)
}

func setPostureRuleState(model *postureRuleModel, rule *tunnet.PostureRule) diag.Diagnostics {
	model.ID = types.StringValue(rule.ID)
	model.Name = types.StringValue(rule.Name)
	return nil
}
