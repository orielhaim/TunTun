package tunnet

import (
	"context"
	"fmt"
	"net/http"
)

// TagDefinition is an organization-scoped tag with ownership rules.
type TagDefinition struct {
	ID             string   `json:"id"`
	OrganizationID string   `json:"organizationId,omitempty"`
	Name           string   `json:"name"`
	Owners         []string `json:"owners,omitempty"`
	MachineCount   int      `json:"machineCount,omitempty"`
	CreatedAt      string   `json:"createdAt,omitempty"`
}

// CreateTagDefinitionInput is the payload for creating a tag definition.
type CreateTagDefinitionInput struct {
	Name   string   `json:"name"`
	Owners []string `json:"owners,omitempty"`
}

// UpdateTagDefinitionInput is the payload for updating a tag definition.
type UpdateTagDefinitionInput struct {
	Name   *string  `json:"name,omitempty"`
	Owners []string `json:"owners,omitempty"`
}

// HostAlias maps a name to an IP or CIDR.
type HostAlias struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
	Address        string `json:"address"`
}

// IPSet is a named collection of hosts/CIDRs.
type IPSet struct {
	ID             string   `json:"id"`
	OrganizationID string   `json:"organizationId"`
	Name           string   `json:"name"`
	Members        []string `json:"members,omitempty"`
}

// ACLRule is an L4 access control rule.
type ACLRule struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
	Action         string `json:"action"`
}

// Grant grants access between selectors.
type Grant struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
}

// SSHRule is an SSH access rule.
type SSHRule struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
}

// PostureRule is a device posture requirement.
type PostureRule struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
}

// AutoApprover automatically approves routes or peers.
type AutoApprover struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
}

func (c *Client) tagDefinitionsPath() string {
	return fmt.Sprintf("/api/v1/organizations/%s/tag-definitions", c.organizationID)
}

func (c *Client) tagDefinitionPath(id string) string {
	return fmt.Sprintf("%s/%s", c.tagDefinitionsPath(), id)
}

// ListTagDefinitions lists tag definitions.
func (c *Client) ListTagDefinitions(ctx context.Context) ([]TagDefinition, error) {
	var out struct {
		Tags []TagDefinition `json:"tags"`
	}
	if err := c.do(ctx, http.MethodGet, c.tagDefinitionsPath(), nil, &out); err != nil {
		return nil, err
	}
	return out.Tags, nil
}

// GetTagDefinition returns a tag definition by ID.
func (c *Client) GetTagDefinition(ctx context.Context, id string) (*TagDefinition, error) {
	tags, err := c.ListTagDefinitions(ctx)
	if err != nil {
		return nil, err
	}
	for i := range tags {
		if tags[i].ID == id {
			return &tags[i], nil
		}
	}
	return nil, &APIError{
		StatusCode: http.StatusNotFound,
		Method:     http.MethodGet,
		Path:       c.tagDefinitionPath(id),
		Body:       "tag definition not found",
	}
}

// CreateTagDefinition creates a tag definition.
func (c *Client) CreateTagDefinition(ctx context.Context, tag TagDefinition) (*TagDefinition, error) {
	var created TagDefinition
	if err := c.do(ctx, http.MethodPost, c.tagDefinitionsPath(), CreateTagDefinitionInput{
		Name:   tag.Name,
		Owners: tag.Owners,
	}, &created); err != nil {
		return nil, err
	}
	return &created, nil
}

// UpdateTagDefinition updates a tag definition.
func (c *Client) UpdateTagDefinition(ctx context.Context, id string, tag TagDefinition) (*TagDefinition, error) {
	input := UpdateTagDefinitionInput{Owners: tag.Owners}
	if tag.Name != "" {
		name := tag.Name
		input.Name = &name
	}
	var updated TagDefinition
	if err := c.do(ctx, http.MethodPatch, c.tagDefinitionPath(id), input, &updated); err != nil {
		return nil, err
	}
	return &updated, nil
}

// DeleteTagDefinition deletes a tag definition.
func (c *Client) DeleteTagDefinition(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, c.tagDefinitionPath(id), nil, nil)
}

// ListHostAliases lists host aliases.
func (c *Client) ListHostAliases(ctx context.Context) ([]HostAlias, error) {
	return nil, ErrNotImplemented
}

// GetHostAlias returns a host alias by ID.
func (c *Client) GetHostAlias(ctx context.Context, id string) (*HostAlias, error) {
	return nil, ErrNotImplemented
}

// CreateHostAlias creates a host alias.
func (c *Client) CreateHostAlias(ctx context.Context, host HostAlias) (*HostAlias, error) {
	return nil, ErrNotImplemented
}

// UpdateHostAlias updates a host alias.
func (c *Client) UpdateHostAlias(ctx context.Context, id string, host HostAlias) (*HostAlias, error) {
	return nil, ErrNotImplemented
}

// DeleteHostAlias deletes a host alias.
func (c *Client) DeleteHostAlias(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListIPSets lists IP sets.
func (c *Client) ListIPSets(ctx context.Context) ([]IPSet, error) {
	return nil, ErrNotImplemented
}

// GetIPSet returns an IP set by ID.
func (c *Client) GetIPSet(ctx context.Context, id string) (*IPSet, error) {
	return nil, ErrNotImplemented
}

// CreateIPSet creates an IP set.
func (c *Client) CreateIPSet(ctx context.Context, set IPSet) (*IPSet, error) {
	return nil, ErrNotImplemented
}

// UpdateIPSet updates an IP set.
func (c *Client) UpdateIPSet(ctx context.Context, id string, set IPSet) (*IPSet, error) {
	return nil, ErrNotImplemented
}

// DeleteIPSet deletes an IP set.
func (c *Client) DeleteIPSet(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListACLRules lists ACL rules.
func (c *Client) ListACLRules(ctx context.Context) ([]ACLRule, error) {
	return nil, ErrNotImplemented
}

// GetACLRule returns an ACL rule by ID.
func (c *Client) GetACLRule(ctx context.Context, id string) (*ACLRule, error) {
	return nil, ErrNotImplemented
}

// CreateACLRule creates an ACL rule.
func (c *Client) CreateACLRule(ctx context.Context, rule ACLRule) (*ACLRule, error) {
	return nil, ErrNotImplemented
}

// UpdateACLRule updates an ACL rule.
func (c *Client) UpdateACLRule(ctx context.Context, id string, rule ACLRule) (*ACLRule, error) {
	return nil, ErrNotImplemented
}

// DeleteACLRule deletes an ACL rule.
func (c *Client) DeleteACLRule(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListGrants lists grants.
func (c *Client) ListGrants(ctx context.Context) ([]Grant, error) {
	return nil, ErrNotImplemented
}

// GetGrant returns a grant by ID.
func (c *Client) GetGrant(ctx context.Context, id string) (*Grant, error) {
	return nil, ErrNotImplemented
}

// CreateGrant creates a grant.
func (c *Client) CreateGrant(ctx context.Context, grant Grant) (*Grant, error) {
	return nil, ErrNotImplemented
}

// UpdateGrant updates a grant.
func (c *Client) UpdateGrant(ctx context.Context, id string, grant Grant) (*Grant, error) {
	return nil, ErrNotImplemented
}

// DeleteGrant deletes a grant.
func (c *Client) DeleteGrant(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListSSHRules lists SSH rules.
func (c *Client) ListSSHRules(ctx context.Context) ([]SSHRule, error) {
	return nil, ErrNotImplemented
}

// GetSSHRule returns an SSH rule by ID.
func (c *Client) GetSSHRule(ctx context.Context, id string) (*SSHRule, error) {
	return nil, ErrNotImplemented
}

// CreateSSHRule creates an SSH rule.
func (c *Client) CreateSSHRule(ctx context.Context, rule SSHRule) (*SSHRule, error) {
	return nil, ErrNotImplemented
}

// UpdateSSHRule updates an SSH rule.
func (c *Client) UpdateSSHRule(ctx context.Context, id string, rule SSHRule) (*SSHRule, error) {
	return nil, ErrNotImplemented
}

// DeleteSSHRule deletes an SSH rule.
func (c *Client) DeleteSSHRule(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListPostureRules lists posture rules.
func (c *Client) ListPostureRules(ctx context.Context) ([]PostureRule, error) {
	return nil, ErrNotImplemented
}

// GetPostureRule returns a posture rule by ID.
func (c *Client) GetPostureRule(ctx context.Context, id string) (*PostureRule, error) {
	return nil, ErrNotImplemented
}

// CreatePostureRule creates a posture rule.
func (c *Client) CreatePostureRule(ctx context.Context, rule PostureRule) (*PostureRule, error) {
	return nil, ErrNotImplemented
}

// UpdatePostureRule updates a posture rule.
func (c *Client) UpdatePostureRule(ctx context.Context, id string, rule PostureRule) (*PostureRule, error) {
	return nil, ErrNotImplemented
}

// DeletePostureRule deletes a posture rule.
func (c *Client) DeletePostureRule(ctx context.Context, id string) error {
	return ErrNotImplemented
}

// ListAutoApprovers lists auto approvers.
func (c *Client) ListAutoApprovers(ctx context.Context) ([]AutoApprover, error) {
	return nil, ErrNotImplemented
}

// GetAutoApprover returns an auto approver by ID.
func (c *Client) GetAutoApprover(ctx context.Context, id string) (*AutoApprover, error) {
	return nil, ErrNotImplemented
}

// CreateAutoApprover creates an auto approver.
func (c *Client) CreateAutoApprover(ctx context.Context, approver AutoApprover) (*AutoApprover, error) {
	return nil, ErrNotImplemented
}

// UpdateAutoApprover updates an auto approver.
func (c *Client) UpdateAutoApprover(ctx context.Context, id string, approver AutoApprover) (*AutoApprover, error) {
	return nil, ErrNotImplemented
}

// DeleteAutoApprover deletes an auto approver.
func (c *Client) DeleteAutoApprover(ctx context.Context, id string) error {
	return ErrNotImplemented
}
