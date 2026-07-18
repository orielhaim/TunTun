package tunnet

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

const (
	EnvAPIURL            = "TUNNET_API_URL"
	EnvAPIKey            = "TUNNET_API_KEY"
	EnvOrganizationID    = "TUNNET_ORGANIZATION_ID"
	EnvNetworkID         = "TUNNET_NETWORK_ID"
	EnvOAuthClientID     = "TUNNET_OAUTH_CLIENT_ID"
	EnvOAuthClientSecret = "TUNNET_OAUTH_CLIENT_SECRET"
	DefaultAPIURL        = "https://api.tunnet.io"
)

// AuthConfig holds Tunnet Management API credentials.
type AuthConfig struct {
	APIKey         string
	OrganizationID string
	NetworkID      string

	// OAuth2 client credentials (Phase 3).
	OAuthClientID     string
	OAuthClientSecret string
}

// AuthConfigFromEnv loads credentials from standard environment variables.
func AuthConfigFromEnv() AuthConfig {
	return AuthConfig{
		APIKey:            os.Getenv(EnvAPIKey),
		OrganizationID:    os.Getenv(EnvOrganizationID),
		NetworkID:         os.Getenv(EnvNetworkID),
		OAuthClientID:     os.Getenv(EnvOAuthClientID),
		OAuthClientSecret: os.Getenv(EnvOAuthClientSecret),
	}
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	ExpiresIn   int    `json:"expires_in"`
	Scope       string `json:"scope"`
}

// FetchClientCredentialsToken exchanges OAuth2 client credentials for an access token.
func FetchClientCredentialsToken(ctx context.Context, baseURL, clientID, clientSecret, scope string, httpClient *http.Client) (string, error) {
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}
	body := map[string]string{
		"grant_type":    "client_credentials",
		"client_id":     clientID,
		"client_secret": clientSecret,
	}
	if scope != "" {
		body["scope"] = scope
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/api/v1/auth/token", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("oauth token exchange failed: HTTP %d", res.StatusCode)
	}
	var tr tokenResponse
	if err := json.NewDecoder(res.Body).Decode(&tr); err != nil {
		return "", err
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("oauth token exchange returned empty access_token")
	}
	return tr.AccessToken, nil
}
