package tunnet

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// PolicyFormat is the serialization format for policy documents.
type PolicyFormat string

const (
	PolicyFormatHCL  PolicyFormat = "hcl"
	PolicyFormatJSON PolicyFormat = "json"
	PolicyFormatYAML PolicyFormat = "yaml"
)

// PolicyValidateRequest is the payload for policy validation.
type PolicyValidateRequest struct {
	Document json.RawMessage `json:"document"`
	Format   PolicyFormat    `json:"format,omitempty"`
}

// PolicyValidateResult is returned by policy validation.
type PolicyValidateResult struct {
	Valid    bool              `json:"valid"`
	Errors   []PolicyIssue     `json:"errors,omitempty"`
	Warnings []PolicyIssue     `json:"warnings,omitempty"`
	Tests    []PolicyTestRun   `json:"tests,omitempty"`
	Metadata map[string]string `json:"metadata,omitempty"`
}

// PolicyIssue describes a validation error or warning.
type PolicyIssue struct {
	Path    string `json:"path,omitempty"`
	Message string `json:"message"`
	Code    string `json:"code,omitempty"`
}

// PolicyTestRun describes a single policy test result.
type PolicyTestRun struct {
	Name    string `json:"name"`
	Passed  bool   `json:"passed"`
	Message string `json:"message,omitempty"`
}

// PolicyApplyRequest is the payload for applying a policy document.
type PolicyApplyRequest struct {
	Document json.RawMessage `json:"document"`
	Format   PolicyFormat    `json:"format,omitempty"`
	Force    bool            `json:"force,omitempty"`
	Message  string          `json:"message,omitempty"`
}

// PolicyApplyResult is returned by policy apply.
type PolicyApplyResult struct {
	RevisionID string            `json:"revisionId,omitempty"`
	Applied    bool              `json:"applied"`
	Metadata   map[string]string `json:"metadata,omitempty"`
}

// PolicyExportRequest configures policy export.
type PolicyExportRequest struct {
	Format    PolicyFormat `json:"format,omitempty"`
	NetworkID string       `json:"networkId,omitempty"`
}

// PolicyExportResult is returned by policy export.
type PolicyExportResult struct {
	Document json.RawMessage `json:"document"`
	Format   PolicyFormat    `json:"format,omitempty"`
}

// PolicyDiffRequest is the payload for semantic policy diff.
type PolicyDiffRequest struct {
	Document json.RawMessage `json:"document"`
	Format   PolicyFormat    `json:"format,omitempty"`
}

// PolicyDiffResult is returned by policy diff.
type PolicyDiffResult struct {
	Changes []PolicyChange `json:"changes,omitempty"`
}

// PolicyChange describes a semantic policy change.
type PolicyChange struct {
	Action string `json:"action"`
	Path   string `json:"path,omitempty"`
	Before any    `json:"before,omitempty"`
	After  any    `json:"after,omitempty"`
}

// PolicySimulateRequest is the payload for traffic simulation.
type PolicySimulateRequest struct {
	Scenarios []PolicySimulateScenario `json:"scenarios"`
}

// PolicySimulateScenario describes a single simulation scenario.
type PolicySimulateScenario struct {
	Name      string `json:"name,omitempty"`
	Source    string `json:"source"`
	Dest      string `json:"dest"`
	Port      int    `json:"port,omitempty"`
	Protocol  string `json:"protocol,omitempty"`
	NetworkID string `json:"networkId,omitempty"`
}

// PolicySimulateResult is returned by policy simulation.
type PolicySimulateResult struct {
	Results []PolicySimulateOutcome `json:"results,omitempty"`
}

// PolicySimulateOutcome is a single simulation outcome.
type PolicySimulateOutcome struct {
	Name    string   `json:"name,omitempty"`
	Verdict string   `json:"verdict"`
	Rule    string   `json:"rule,omitempty"`
	Trace   []string `json:"trace,omitempty"`
}

// PolicyDriftResult is returned by drift detection.
type PolicyDriftResult struct {
	HasDrift bool           `json:"hasDrift"`
	Changes  []PolicyChange `json:"changes,omitempty"`
}

// PolicyRevision describes a stored policy revision.
type PolicyRevision struct {
	ID        string `json:"id"`
	CreatedAt string `json:"createdAt,omitempty"`
	Message   string `json:"message,omitempty"`
	Source    string `json:"source,omitempty"`
}

// PolicyRollbackRequest is the payload for rolling back policy.
type PolicyRollbackRequest struct {
	RevisionID string `json:"revisionId"`
}

func (c *Client) policyPath(action string) string {
	return fmt.Sprintf("/api/v1/organizations/%s/policy/%s", c.organizationID, action)
}

// ValidatePolicy validates a policy document without writing.
func (c *Client) ValidatePolicy(ctx context.Context, req PolicyValidateRequest) (*PolicyValidateResult, error) {
	var result PolicyValidateResult
	if err := c.do(ctx, http.MethodPost, c.policyPath("validate"), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ApplyPolicy applies a policy document to the organization store.
func (c *Client) ApplyPolicy(ctx context.Context, req PolicyApplyRequest) (*PolicyApplyResult, error) {
	var result PolicyApplyResult
	if err := c.do(ctx, http.MethodPost, c.policyPath("apply"), req, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// ExportPolicy exports the live policy document.
func (c *Client) ExportPolicy(ctx context.Context, req PolicyExportRequest) (*PolicyExportResult, error) {
	path := c.policyPath("export")
	if req.Format != "" {
		path = fmt.Sprintf("%s?format=%s", path, req.Format)
	}
	if req.NetworkID != "" {
		sep := "?"
		if req.Format != "" {
			sep = "&"
		}
		path = fmt.Sprintf("%s%snetworkId=%s", path, sep, req.NetworkID)
	}

	var result PolicyExportResult
	if err := c.do(ctx, http.MethodGet, path, nil, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

// DiffPolicy compares a document against live state.
func (c *Client) DiffPolicy(ctx context.Context, req PolicyDiffRequest) (*PolicyDiffResult, error) {
	return nil, ErrNotImplemented
}

// SimulatePolicy runs traffic simulation scenarios.
func (c *Client) SimulatePolicy(ctx context.Context, req PolicySimulateRequest) (*PolicySimulateResult, error) {
	return nil, ErrNotImplemented
}

// DriftPolicy detects drift between live state and baseline.
func (c *Client) DriftPolicy(ctx context.Context) (*PolicyDriftResult, error) {
	return nil, ErrNotImplemented
}

// PolicyHistory returns policy revision history.
func (c *Client) PolicyHistory(ctx context.Context) ([]PolicyRevision, error) {
	return nil, ErrNotImplemented
}

// RollbackPolicy rolls back to a prior revision.
func (c *Client) RollbackPolicy(ctx context.Context, req PolicyRollbackRequest) (*PolicyApplyResult, error) {
	return nil, ErrNotImplemented
}
