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
	_ resource.Resource                = (*ipSetResource)(nil)
	_ resource.ResourceWithConfigure   = (*ipSetResource)(nil)
	_ resource.ResourceWithImportState = (*ipSetResource)(nil)
	_ resource.ResourceWithIdentity    = (*ipSetResource)(nil)
)

type ipSetResource struct {
	client *tunnet.Client
}

type ipSetModel struct {
	ID      types.String `tfsdk:"id"`
	Name    types.String `tfsdk:"name"`
	Members types.Set    `tfsdk:"members"`
}

func NewIPSetResource() resource.Resource {
	return &ipSetResource{}
}

func (r *ipSetResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_ip_set"
}

func (r *ipSetResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet IP set.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "IP set ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "IP set name.",
			},
			"members": schema.SetAttribute{
				Optional:    true,
				ElementType: types.StringType,
				Description: "Host aliases, CIDRs, or other IP set members.",
			},
		},
	}
}

func (r *ipSetResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *ipSetResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *ipSetResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *ipSetResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan ipSetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	members, diags := setFromTerraform(ctx, plan.Members)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	set, err := r.client.CreateIPSet(ctx, tunnet.IPSet{
		Name:    plan.Name.ValueString(),
		Members: members,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create ip set", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setIPSetState(ctx, &plan, set)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, set.ID)...)
}

func (r *ipSetResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state ipSetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	set, err := r.client.GetIPSet(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read ip set", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setIPSetState(ctx, &state, set)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, set.ID)...)
}

func (r *ipSetResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan ipSetModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	members, diags := setFromTerraform(ctx, plan.Members)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	set, err := r.client.UpdateIPSet(ctx, plan.ID.ValueString(), tunnet.IPSet{
		Name:    plan.Name.ValueString(),
		Members: members,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update ip set", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setIPSetState(ctx, &plan, set)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, set.ID)...)
}

func (r *ipSetResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state ipSetModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteIPSet(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete ip set", err)...)
}

func setIPSetState(ctx context.Context, model *ipSetModel, set *tunnet.IPSet) diag.Diagnostics {
	var diags diag.Diagnostics
	model.ID = types.StringValue(set.ID)
	model.Name = types.StringValue(set.Name)
	members, memberDiags := setToTerraform(ctx, set.Members)
	diags.Append(memberDiags...)
	model.Members = members
	return diags
}
