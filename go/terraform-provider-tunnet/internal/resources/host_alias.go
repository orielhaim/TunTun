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
	_ resource.Resource                = (*hostAliasResource)(nil)
	_ resource.ResourceWithConfigure   = (*hostAliasResource)(nil)
	_ resource.ResourceWithImportState = (*hostAliasResource)(nil)
	_ resource.ResourceWithIdentity    = (*hostAliasResource)(nil)
)

type hostAliasResource struct {
	client *tunnet.Client
}

type hostAliasModel struct {
	ID      types.String `tfsdk:"id"`
	Name    types.String `tfsdk:"name"`
	Address types.String `tfsdk:"address"`
}

func NewHostAliasResource() resource.Resource {
	return &hostAliasResource{}
}

func (r *hostAliasResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_host_alias"
}

func (r *hostAliasResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet host alias.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Host alias ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Host alias name.",
			},
			"address": schema.StringAttribute{
				Required:    true,
				Description: "IP address or CIDR.",
			},
		},
	}
}

func (r *hostAliasResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *hostAliasResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *hostAliasResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *hostAliasResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan hostAliasModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	host, err := r.client.CreateHostAlias(ctx, tunnet.HostAlias{
		Name:    plan.Name.ValueString(),
		Address: plan.Address.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create host alias", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setHostAliasState(&plan, host)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, host.ID)...)
}

func (r *hostAliasResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state hostAliasModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	host, err := r.client.GetHostAlias(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read host alias", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setHostAliasState(&state, host)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, host.ID)...)
}

func (r *hostAliasResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan hostAliasModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	host, err := r.client.UpdateHostAlias(ctx, plan.ID.ValueString(), tunnet.HostAlias{
		Name:    plan.Name.ValueString(),
		Address: plan.Address.ValueString(),
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update host alias", err)...); resp.Diagnostics.HasError() {
		return
	}

	resp.Diagnostics.Append(setHostAliasState(&plan, host)...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
	resp.Diagnostics.Append(setResourceIdentity(ctx, resp.Identity, host.ID)...)
}

func (r *hostAliasResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state hostAliasModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteHostAlias(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete host alias", err)...)
}

func setHostAliasState(model *hostAliasModel, host *tunnet.HostAlias) diag.Diagnostics {
	model.ID = types.StringValue(host.ID)
	model.Name = types.StringValue(host.Name)
	model.Address = types.StringValue(host.Address)
	return nil
}
