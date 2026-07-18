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

var _ resource.Resource = (*ipSetResource)(nil)

type ipSetResource struct{ client *tunnet.Client }

type ipSetModel struct {
	ID      types.String `tfsdk:"id"`
	Name    types.String `tfsdk:"name"`
	Members types.Set    `tfsdk:"members"`
}

func NewIPSetResource() resource.Resource { return &ipSetResource{} }

func (r *ipSetResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_ip_set"
}

func (r *ipSetResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed: true,
				PlanModifiers: []planmodifier.String{stringplanmodifier.UseStateForUnknown()},
			},
			"name":    schema.StringAttribute{Required: true},
			"members": schema.SetAttribute{Optional: true, ElementType: types.StringType},
		},
	}
}

func (r *ipSetResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *ipSetResource) Create(ctx context.Context, _ resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}
	_, err := r.client.CreateIPSet(ctx, tunnet.IPSet{})
	resp.Diagnostics.Append(sdkErrorDiag("create ip set", err)...)
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
	_, err := r.client.GetIPSet(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("read ip set", err)...)
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
	_, err := r.client.UpdateIPSet(ctx, plan.ID.ValueString(), tunnet.IPSet{})
	resp.Diagnostics.Append(sdkErrorDiag("update ip set", err)...)
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
