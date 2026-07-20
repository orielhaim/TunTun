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
	_ resource.Resource                = (*tagResource)(nil)
	_ resource.ResourceWithConfigure   = (*tagResource)(nil)
	_ resource.ResourceWithImportState = (*tagResource)(nil)
	_ resource.ResourceWithIdentity    = (*tagResource)(nil)
)

type tagResource struct {
	client *tunnet.Client
}

type tagModel struct {
	ID     types.String `tfsdk:"id"`
	Name   types.String `tfsdk:"name"`
	Owners types.Set    `tfsdk:"owners"`
}

func NewTagResource() resource.Resource {
	return &tagResource{}
}

func (r *tagResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_tag"
}

func (r *tagResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet tag definition.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Tag definition ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Tag name.",
			},
			"owners": schema.SetAttribute{
				Optional:    true,
				ElementType: types.StringType,
				Description: "Owners allowed to assign this tag (user:<id|email>, tag:<name>, or autogroup:admin).",
			},
		},
	}
}

func (r *tagResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *tagResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *tagResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *tagResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan tagModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	owners, diags := setFromTerraform(ctx, plan.Owners)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	tag, err := r.client.CreateTagDefinition(ctx, tunnet.TagDefinition{
		Name:   plan.Name.ValueString(),
		Owners: owners,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create tag", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setTagState(ctx, &plan, tag)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, tag.ID)...)
}

func (r *tagResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state tagModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	tag, err := r.client.GetTagDefinition(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read tag", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setTagState(ctx, &state, tag)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, tag.ID)...)
}

func (r *tagResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan tagModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	owners, diags := setFromTerraform(ctx, plan.Owners)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	tag, err := r.client.UpdateTagDefinition(ctx, plan.ID.ValueString(), tunnet.TagDefinition{
		Name:   plan.Name.ValueString(),
		Owners: owners,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update tag", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setTagState(ctx, &plan, tag)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, tag.ID)...)
}

func (r *tagResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state tagModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteTagDefinition(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete tag", err)...)
}

func setTagState(ctx context.Context, model *tagModel, tag *tunnet.TagDefinition) diag.Diagnostics {
	var diags diag.Diagnostics
	model.ID = types.StringValue(tag.ID)
	model.Name = types.StringValue(tag.Name)
	owners, ownerDiags := setToTerraform(ctx, tag.Owners)
	diags.Append(ownerDiags...)
	model.Owners = owners
	return diags
}
