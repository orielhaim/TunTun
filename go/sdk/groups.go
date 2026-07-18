package tunnet

import (
	"context"
	"fmt"
	"net/http"
)

// UserGroup is an organization-scoped user group.
type UserGroup struct {
	ID             string            `json:"id"`
	OrganizationID string            `json:"organizationId"`
	Name           string            `json:"name"`
	Description    string            `json:"description,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	CreatedAt      string            `json:"createdAt,omitempty"`
	UpdatedAt      string            `json:"updatedAt,omitempty"`
}

// CreateUserGroupInput is the payload for creating a user group.
type CreateUserGroupInput struct {
	Name        string            `json:"name"`
	Description string            `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// UpdateUserGroupInput is the payload for updating a user group.
type UpdateUserGroupInput struct {
	Name        *string           `json:"name,omitempty"`
	Description *string           `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// DeviceGroup is an organization-scoped device group.
type DeviceGroup struct {
	ID             string            `json:"id"`
	OrganizationID string            `json:"organizationId"`
	NetworkID      string            `json:"networkId,omitempty"`
	Name           string            `json:"name"`
	Description    string            `json:"description,omitempty"`
	Labels         map[string]string `json:"labels,omitempty"`
	CreatedAt      string            `json:"createdAt,omitempty"`
	UpdatedAt      string            `json:"updatedAt,omitempty"`
}

// CreateDeviceGroupInput is the payload for creating a device group.
type CreateDeviceGroupInput struct {
	Name        string            `json:"name"`
	NetworkID   string            `json:"networkId,omitempty"`
	Description string            `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

// UpdateDeviceGroupInput is the payload for updating a device group.
type UpdateDeviceGroupInput struct {
	Name        *string           `json:"name,omitempty"`
	NetworkID   *string           `json:"networkId,omitempty"`
	Description *string           `json:"description,omitempty"`
	Labels      map[string]string `json:"labels,omitempty"`
}

func (c *Client) userGroupsPath() string {
	return fmt.Sprintf("/api/v1/organizations/%s/user-groups", c.organizationID)
}

func (c *Client) userGroupPath(id string) string {
	return fmt.Sprintf("%s/%s", c.userGroupsPath(), id)
}

func (c *Client) deviceGroupsPath() string {
	return fmt.Sprintf("/api/v1/organizations/%s/device-groups", c.organizationID)
}

func (c *Client) deviceGroupPath(id string) string {
	return fmt.Sprintf("%s/%s", c.deviceGroupsPath(), id)
}

// ListUserGroups returns all user groups in the organization.
func (c *Client) ListUserGroups(ctx context.Context) ([]UserGroup, error) {
	var groups []UserGroup
	if err := c.do(ctx, http.MethodGet, c.userGroupsPath(), nil, &groups); err != nil {
		return nil, err
	}
	return groups, nil
}

// GetUserGroup returns a single user group by ID.
func (c *Client) GetUserGroup(ctx context.Context, id string) (*UserGroup, error) {
	var group UserGroup
	if err := c.do(ctx, http.MethodGet, c.userGroupPath(id), nil, &group); err != nil {
		return nil, err
	}
	return &group, nil
}

// CreateUserGroup creates a user group.
func (c *Client) CreateUserGroup(ctx context.Context, input CreateUserGroupInput) (*UserGroup, error) {
	var group UserGroup
	if err := c.do(ctx, http.MethodPost, c.userGroupsPath(), input, &group); err != nil {
		return nil, err
	}
	return &group, nil
}

// UpdateUserGroup updates a user group.
func (c *Client) UpdateUserGroup(ctx context.Context, id string, input UpdateUserGroupInput) (*UserGroup, error) {
	var group UserGroup
	if err := c.do(ctx, http.MethodPatch, c.userGroupPath(id), input, &group); err != nil {
		return nil, err
	}
	return &group, nil
}

// DeleteUserGroup deletes a user group.
func (c *Client) DeleteUserGroup(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodDelete, c.userGroupPath(id), nil, nil)
}

// ListDeviceGroups returns all device groups in the organization.
func (c *Client) ListDeviceGroups(ctx context.Context) ([]DeviceGroup, error) {
	return nil, ErrNotImplemented
}

// GetDeviceGroup returns a single device group by ID.
func (c *Client) GetDeviceGroup(ctx context.Context, id string) (*DeviceGroup, error) {
	return nil, ErrNotImplemented
}

// CreateDeviceGroup creates a device group.
func (c *Client) CreateDeviceGroup(ctx context.Context, input CreateDeviceGroupInput) (*DeviceGroup, error) {
	return nil, ErrNotImplemented
}

// UpdateDeviceGroup updates a device group.
func (c *Client) UpdateDeviceGroup(ctx context.Context, id string, input UpdateDeviceGroupInput) (*DeviceGroup, error) {
	return nil, ErrNotImplemented
}

// DeleteDeviceGroup deletes a device group.
func (c *Client) DeleteDeviceGroup(ctx context.Context, id string) error {
	return ErrNotImplemented
}
