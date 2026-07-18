package datasources

import (
	"context"

	"github.com/hashicorp/terraform-plugin-framework/datasource"
	"github.com/hashicorp/terraform-plugin-framework/datasource/schema"
	"github.com/hashicorp/terraform-plugin-framework/types"
	tunnet "github.com/tunnetio/tunnet-go"
)

var _ datasource.DataSource = (*policyDocumentDataSource)(nil)

type policyDocumentDataSource struct {
	client *tunnet.Client
}

type policyDocumentModel struct {
	Document types.String `tfsdk:"document"`
	Format   types.String `tfsdk:"format"`
}

func NewPolicyDocumentDataSource() datasource.DataSource { return &policyDocumentDataSource{} }

func (d *policyDocumentDataSource) Metadata(_ context.Context, req datasource.MetadataRequest, resp *datasource.MetadataResponse) {
	resp.TypeName = req.ProviderTypeName + "_policy_document"
}

func (d *policyDocumentDataSource) Schema(_ context.Context, _ datasource.SchemaRequest, resp *datasource.SchemaResponse) {
	resp.Schema = schema.Schema{
		Attributes: map[string]schema.Attribute{
			"format": schema.StringAttribute{
				Optional: true,
			},
			"document": schema.StringAttribute{
				Computed: true,
			},
		},
	}
}

func (d *policyDocumentDataSource) Configure(_ context.Context, req datasource.ConfigureRequest, resp *datasource.ConfigureResponse) {
	if req.ProviderData == nil {
		return
	}
	client, ok := req.ProviderData.(*tunnet.Client)
	if !ok {
		resp.Diagnostics.AddError("Unexpected provider data", "expected *tunnet.Client")
		return
	}
	d.client = client
}

func (d *policyDocumentDataSource) Read(ctx context.Context, req datasource.ReadRequest, resp *datasource.ReadResponse) {
	if d.client == nil {
		return
	}

	var config policyDocumentModel
	resp.Diagnostics.Append(req.Config.Get(ctx, &config)...)
	if resp.Diagnostics.HasError() {
		return
	}

	exportResult, err := d.client.ExportPolicy(ctx, tunnet.PolicyExportRequest{
		Format: tunnet.PolicyFormat(config.Format.ValueString()),
	})
	if err != nil {
		resp.Diagnostics.AddError("Tunnet API export policy failed", err.Error())
		return
	}

	var state policyDocumentModel
	state.Document = types.StringValue(string(exportResult.Document))
	state.Format = types.StringValue(string(exportResult.Format))
	resp.Diagnostics.Append(resp.State.Set(ctx, &state)...)
}
