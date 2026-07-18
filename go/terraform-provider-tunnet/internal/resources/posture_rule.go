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

var _ resource.Resource = (*postureRuleResource)(nil)

type postureRuleResource struct{ client *tunnet.Client }

type postureRuleModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewPostureRuleResource() resource.Resource { return &postureRuleResource{} }

func (r *postureRuleResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_posture_rule"
}

func (r *postureRuleResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
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

func (r *postureRuleResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *postureRuleResource) Create(ctx context.Context, _ resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}
	_, err := r.client.CreatePostureRule(ctx, tunnet.PostureRule{})
	resp.Diagnostics.Append(sdkErrorDiag("create posture rule", err)...)
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
	_, err := r.client.GetPostureRule(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("read posture rule", err)...)
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
	_, err := r.client.UpdatePostureRule(ctx, plan.ID.ValueString(), tunnet.PostureRule{})
	resp.Diagnostics.Append(sdkErrorDiag("update posture rule", err)...)
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
