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

var _ resource.Resource = (*userGroupResource)(nil)

type userGroupResource struct {
	client *tunnet.Client
}

type userGroupModel struct {
	ID          types.String `tfsdk:"id"`
	Name        types.String `tfsdk:"name"`
	Description types.String `tfsdk:"description"`
	Labels      types.Map    `tfsdk:"labels"`
}

func NewUserGroupResource() resource.Resource {
	return &userGroupResource{}
}

func (r *userGroupResource) Metadata(_ context.Context, req resource.MetadataRequest, resp *resource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_user_group"
}

func (r *userGroupResource) Schema(_ context.Context, _ resource.SchemaRequest, resp *resource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Description: "Manages a Tunnet user group.",
		Attributes: map[string]schema.Attribute{
			"id": schema.StringAttribute{
				Computed:    true,
				Description: "User group ID.",
				PlanModifiers: []planmodifier.String{
					stringplanmodifier.UseStateForUnknown(),
				},
			},
			"name": schema.StringAttribute{
				Required:    true,
				Description: "User group name.",
			},
			"description": schema.StringAttribute{
				Optional:    true,
				Description: "User group description.",
			},
			"labels": schema.MapAttribute{
				Optional:    true,
				ElementType: types.StringType,
				Description: "Optional labels.",
			},
		},
	}
}

func (r *userGroupResource) Configure(_ context.Context, req resource.ConfigureRequest, resp *resource.ConfigureResponse) {
	r.client = clientFromResource(context.Background(), req, resp)
}

func (r *userGroupResource) Create(ctx context.Context, req resource.CreateRequest, resp *resource.CreateResponse) {
	if r.client == nil {
		return
	}

	var plan userGroupModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	labels, diags := mapFromTerraform(ctx, plan.Labels)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	group, err := r.client.CreateUserGroup(ctx, tunnet.CreateUserGroupInput{
		Name:        plan.Name.ValueString(),
		Description: plan.Description.ValueString(),
		Labels:      labels,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("create user group", err)...); resp.Diagnostics.HasError() {
		return
	}

	plan.ID = types.StringValue(group.ID)
	plan.Name = types.StringValue(group.Name)
	plan.Description = types.StringValue(group.Description)
	plan.Labels, diags = mapToTerraform(ctx, group.Labels)
	resp.Diagnostics.Append(diags...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *userGroupResource) Read(ctx context.Context, req resource.ReadRequest, resp *resource.ReadResponse) {
	if r.client == nil {
		return
	}

	var state userGroupModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	group, err := r.client.GetUserGroup(ctx, state.ID.ValueString())
	if resp.Diagnostics.Append(sdkErrorDiag("read user group", err)...); resp.Diagnostics.HasError() {
		return
	}

	state.ID = types.StringValue(group.ID)
	state.Name = types.StringValue(group.Name)
	state.Description = types.StringValue(group.Description)
	labels, diags := mapToTerraform(ctx, group.Labels)
	resp.Diagnostics.Append(diags...)
	state.Labels = labels
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}

func (r *userGroupResource) Update(ctx context.Context, req resource.UpdateRequest, resp *resource.UpdateResponse) {
	if r.client == nil {
		return
	}

	var plan userGroupModel
	resp.Diagnostics.Append(req.Plan.Get(ctx, &plan)...)
	if resp.Diagnostics.HasError() {
		return
	}

	name := plan.Name.ValueString()
	description := plan.Description.ValueString()
	labels, diags := mapFromTerraform(ctx, plan.Labels)
	resp.Diagnostics.Append(diags...)
	if resp.Diagnostics.HasError() {
		return
	}

	group, err := r.client.UpdateUserGroup(ctx, plan.ID.ValueString(), tunnet.UpdateUserGroupInput{
		Name:        &name,
		Description: &description,
		Labels:      labels,
	})
	if resp.Diagnostics.Append(sdkErrorDiag("update user group", err)...); resp.Diagnostics.HasError() {
		return
	}

	plan.Name = types.StringValue(group.Name)
	plan.Description = types.StringValue(group.Description)
	plan.Labels, diags = mapToTerraform(ctx, group.Labels)
	resp.Diagnostics.Append(diags...)
	resp.Diagnostics.Append(resp.State.Set(ctx, &plan)...)
}

func (r *userGroupResource) Delete(ctx context.Context, req resource.DeleteRequest, resp *resource.DeleteResponse) {
	if r.client == nil {
		return
	}

	var state userGroupModel
	resp.Diagnostics.Append(req.State.Get(ctx, &state)...)
	if resp.Diagnostics.HasError() {
		return
	}

	err := r.client.DeleteUserGroup(ctx, state.ID.ValueString())
	resp.Diagnostics.Append(sdkErrorDiag("delete user group", err)...)
}
