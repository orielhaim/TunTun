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

var (
	_ resource.Resource                = (*authKeyResource)(nil)
	_ resource.ResourceWithConfigure   = (*authKeyResource)(nil)
	_ resource.ResourceWithImportState = (*authKeyResource)(nil)
	_ resource.ResourceWithIdentity    = (*authKeyResource)(nil)
)

type authKeyResource struct {
	client *tunnet.Client
}

type authKeyModel struct {
	ID   types.String `tfsdk:"id"`
	Name types.String `tfsdk:"name"`
}

func NewAuthKeyResource() resource.Resource {
	return &authKeyResource{}
}

func (r *authKeyResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_auth_key"
}

func (r *authKeyResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet auth key.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "Auth key ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "Auth key name.",
			},
		},
	}
}

func (r *authKeyResource) IdentitySchema(_ context.Context, _ resource.IdentitySchemaRequest, resp *resource.IdentitySchemaResponse) {
	resp.IdentitySchema = idIdentitySchema()
}

func (r *authKeyResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(req, resp)
}

func (r *authKeyResource) ImportState(ctx context.Context, req resource.ImportStateRequest, resp *resource.ImportStateResponse) {
	importByID(ctx, req, resp)
}

func (r *authKeyResource) Create(ctx context.Context, _ resource.CreateRequest, resp *resource.CreateResponse) {
	resp.Diagnostics.Append(notImplementedDiag("create", "tunnet_auth_key")...)
}

func (r *authKeyResource) Read(ctx context.Context, _ resource.ReadRequest, resp *resource.ReadResponse) {
	resp.Diagnostics.Append(notImplementedDiag("read", "tunnet_auth_key")...)
}

func (r *authKeyResource) Update(ctx context.Context, _ resource.UpdateRequest, resp *resource.UpdateResponse) {
	resp.Diagnostics.Append(notImplementedDiag("update", "tunnet_auth_key")...)
}

func (r *authKeyResource) Delete(ctx context.Context, _ resource.DeleteRequest, resp *resource.DeleteResponse) {
	resp.Diagnostics.Append(notImplementedDiag("delete", "tunnet_auth_key")...)
}
