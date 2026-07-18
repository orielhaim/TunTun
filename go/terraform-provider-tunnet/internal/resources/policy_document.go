package resources

import (
	"context"
	"encoding/json"

	"github.com/hashicorp/terraform-plugin-framework/resource"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/planmodifier"
	"github.com/hashicorp/terraform-plugin-framework/resource/schema/stringplanmodifier"
	"github.com/hashicorp/terraform-plugin-framework/types"
	tunnet "github.com/tunnetio/tunnet-go"
)

var _ resource.Resource = (*policyDocumentResource)(nil)

type policyDocumentResource struct{ client *tunnet.Client }

type policyDocumentModel struct {
	ID       types.String `tfsdk:"id"`
	Document types.String `tfsdk:"document"`
	Format   types.String `tfsdk:"format"`
	Force    types.Bool   `tfsdk:"force"`
}

func NewPolicyDocumentResource() resource.Resource { return &policyDocumentResource{} }

func (r *policyDocumentResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_policy_document"
}

func (r *policyDocumentResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a monolithic Tunnet policy document.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"document": schema.StringAttribute{
				Required:    true,
				Description: "Policy document body (HCL, JSON, or YAML).",
			},
			"format": schema.StringAttribute{
				Optional:    true,
				Description: "Document format: hcl, json, or yaml.",
			},
			"force": schema.BoolAttribute{
				Optional:    true,
				Description: "Apply even when drift is detected.",
			},
		},
	}
}

func (r *policyDocumentResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *policyDocumentResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan policyDocumentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	format := tunnet.PolicyFormat(plan.Format.ValueString())
	document := json.RawMessage(plan.Document.ValueString())

	validateResult, err := r.client.ValidatePolicy(ctx, tunnet.PolicyValidateRequest{
		Document: document,
		Format:   format,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("validate policy", err)...); resp.Diagnostics.HasError() {
		return
	}
	if validateResult != nil && !validateResult.Valid {
		resp.Diagnostics.AddError("Policy validation failed", "document is invalid")
		return
	}

	applyResult, err := r.client.ApplyPolicy(ctx, tunnet.PolicyApplyRequest{
		Document: document,
		Format:   format,
		Force:    plan.Force.ValueBool(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("apply policy", err)...); resp.Diagnostics.HasError() {
		return
	}

	if applyResult != nil && applyResult.RevisionID != "" {
		plan.ID = types.StringValue(applyResult.RevisionID)
	} else {
		plan.ID = types.StringValue("policy")
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *policyDocumentResource) Read(ctx context.Context, _ resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	exportResult, err := r.client.ExportPolicy(ctx, tunnet.PolicyExportRequest{})
	if resp.Diagnostics.Append(sdkErrorDiag("export policy", err)...); resp.Diagnostics.HasError() {
		return
	}

	var state policyDocumentModel
	state.ID = types.StringValue("policy")
	state.Document = types.StringValue(string(exportResult.Document))
	state.Format = types.StringValue(string(exportResult.Format))
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *policyDocumentResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan policyDocumentModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	format := tunnet.PolicyFormat(plan.Format.ValueString())
	document := json.RawMessage(plan.Document.ValueString())

	validateResult, err := r.client.ValidatePolicy(ctx, tunnet.PolicyValidateRequest{
		Document: document,
		Format:   format,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("validate policy", err)...); resp.Diagnostics.HasError() {
		return
	}
	if validateResult != nil && !validateResult.Valid {
		resp.Diagnostics.AddError("Policy validation failed", "document is invalid")
		return
	}

	applyResult, err := r.client.ApplyPolicy(ctx, tunnet.PolicyApplyRequest{
		Document: document,
		Format:   format,
		Force:    plan.Force.ValueBool(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("apply policy", err)...); resp.Diagnostics.HasError() {
		return
	}

	if applyResult != nil && applyResult.RevisionID != "" {
		plan.ID = types.StringValue(applyResult.RevisionID)
	}
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *policyDocumentResource) Delete(ctx context.Context, _ resource.DeleteRequest, resp *resource.DeleteResponse) {
	resp.Diagnostics.Append(notImplementedDiag("delete", "tunnet_policy_document")...)
}
