package tunnet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

var (
	ErrNotImplemented = errors.New("not implemented")
	ErrMissingAPIKey  = errors.New("api key is required")
	ErrMissingOrgID   = errors.New("organization id is required")
)

// Client is the Tunnet Management API HTTP client.
type Client struct {
	baseURL        string
	apiKey         string
	organizationID string
	networkID      string
	httpClient     *http.Client
}

// ClientConfig configures a new Client.
type ClientConfig struct {
	BaseURL        string
	APIKey         string
	OrganizationID string
	NetworkID      string
	HTTPClient     *http.Client

	OAuthClientID     string
	OAuthClientSecret string
	OAuthScope        string
}

// NewClient creates a Management API client.
func NewClient(cfg ClientConfig) (*Client, error) {
	baseURL := strings.TrimRight(cfg.BaseURL, "/")
	if baseURL == "" {
		baseURL = strings.TrimRight(os.Getenv(EnvAPIURL), "/")
	}
	if baseURL == "" {
		baseURL = DefaultAPIURL
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}

	apiKey := cfg.APIKey
	if apiKey == "" {
		apiKey = os.Getenv(EnvAPIKey)
	}
	if apiKey == "" {
		clientID := cfg.OAuthClientID
		if clientID == "" {
			clientID = os.Getenv(EnvOAuthClientID)
		}
		clientSecret := cfg.OAuthClientSecret
		if clientSecret == "" {
			clientSecret = os.Getenv(EnvOAuthClientSecret)
		}
		if clientID != "" && clientSecret != "" {
			tok, err := FetchClientCredentialsToken(
				context.Background(),
				baseURL,
				clientID,
				clientSecret,
				cfg.OAuthScope,
				httpClient,
			)
			if err != nil {
				return nil, fmt.Errorf("oauth client credentials: %w", err)
			}
			apiKey = tok
		}
	}
	if apiKey == "" {
		return nil, ErrMissingAPIKey
	}

	orgID := cfg.OrganizationID
	if orgID == "" {
		orgID = os.Getenv(EnvOrganizationID)
	}
	if orgID == "" {
		return nil, ErrMissingOrgID
	}

	networkID := cfg.NetworkID
	if networkID == "" {
		networkID = os.Getenv(EnvNetworkID)
	}

	return &Client{
		baseURL:        baseURL,
		apiKey:         apiKey,
		organizationID: orgID,
		networkID:      networkID,
		httpClient:     httpClient,
	}, nil
}

// OrganizationID returns the configured organization ID.
func (c *Client) OrganizationID() string {
	return c.organizationID
}

// NetworkID returns the configured network ID, if any.
func (c *Client) NetworkID() string {
	return c.networkID
}

func (c *Client) do(ctx context.Context, method, path string, body any, result any) error {
	var bodyReader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(payload)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bodyReader)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("read response body: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &APIError{
			StatusCode: resp.StatusCode,
			Method:     method,
			Path:       path,
			Body:       string(respBody),
		}
	}

	if result == nil || len(respBody) == 0 || resp.StatusCode == http.StatusNoContent {
		return nil
	}

	if err := json.Unmarshal(respBody, result); err != nil {
		return fmt.Errorf("decode response: %w", err)
	}

	return nil
}

// APIError is returned for non-2xx Management API responses.
type APIError struct {
	StatusCode int
	Method     string
	Path       string
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("tunnet api %s %s: status %d: %s", e.Method, e.Path, e.StatusCode, e.Body)
}
