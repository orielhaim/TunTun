package tunnet

import "context"

// TagDefinition is an organization-scoped tag with ownership rules.
type TagDefinition struct {
	ID             string   `json:"id"`
	OrganizationID string   `json:"organizationId"`
	Name           string   `json:"name"`
	Owners         []string `json:"owners,omitempty"`
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

// ListTagDefinitions lists tag definitions.
func (c *Client) ListTagDefinitions(ctx context.Context) ([]TagDefinition, error) {
	return nil, ErrNotImplemented
}

// GetTagDefinition returns a tag definition by ID.
func (c *Client) GetTagDefinition(ctx context.Context, id string) (*TagDefinition, error) {
	return nil, ErrNotImplemented
}

// CreateTagDefinition creates a tag definition.
func (c *Client) CreateTagDefinition(ctx context.Context, tag TagDefinition) (*TagDefinition, error) {
	return nil, ErrNotImplemented
}

// UpdateTagDefinition updates a tag definition.
func (c *Client) UpdateTagDefinition(ctx context.Context, id string, tag TagDefinition) (*TagDefinition, error) {
	return nil, ErrNotImplemented
}

// DeleteTagDefinition deletes a tag definition.
func (c *Client) DeleteTagDefinition(ctx context.Context, id string) error {
	return ErrNotImplemented
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
