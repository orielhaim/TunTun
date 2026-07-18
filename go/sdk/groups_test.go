package tunnet_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	tunnet "github.com/tunnetio/tunnet-go"
)

func TestUserGroupCRUD(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/organizations/org1/user-groups", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			var input tunnet.CreateUserGroupInput
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatalf("decode create: %v", err)
			}
			_ = json.NewEncoder(w).Encode(tunnet.UserGroup{
				ID:             "ug1",
				OrganizationID: "org1",
				Name:           input.Name,
				Description:    input.Description,
				Labels:         input.Labels,
			})
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode([]tunnet.UserGroup{{
				ID:             "ug1",
				OrganizationID: "org1",
				Name:           "engineering",
			}})
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})
	mux.HandleFunc("/api/v1/organizations/org1/user-groups/ug1", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(tunnet.UserGroup{
				ID:             "ug1",
				OrganizationID: "org1",
				Name:           "engineering",
				Description:    "Eng",
			})
		case http.MethodPatch:
			var input tunnet.UpdateUserGroupInput
			if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
				t.Fatalf("decode update: %v", err)
			}
			name := "engineering"
			if input.Name != nil {
				name = *input.Name
			}
			_ = json.NewEncoder(w).Encode(tunnet.UserGroup{
				ID:             "ug1",
				OrganizationID: "org1",
				Name:           name,
			})
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client, err := tunnet.NewClient(tunnet.ClientConfig{
		BaseURL:        server.URL,
		APIKey:         "key",
		OrganizationID: "org1",
		HTTPClient:     server.Client(),
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	ctx := context.Background()
	created, err := client.CreateUserGroup(ctx, tunnet.CreateUserGroupInput{
		Name:        "engineering",
		Description: "Eng",
		Labels:      map[string]string{"team": "platform"},
	})
	if err != nil {
		t.Fatalf("CreateUserGroup: %v", err)
	}
	if created.ID != "ug1" {
		t.Fatalf("unexpected id %q", created.ID)
	}

	got, err := client.GetUserGroup(ctx, "ug1")
	if err != nil {
		t.Fatalf("GetUserGroup: %v", err)
	}
	if got.Name != "engineering" {
		t.Fatalf("unexpected name %q", got.Name)
	}

	name := "platform"
	updated, err := client.UpdateUserGroup(ctx, "ug1", tunnet.UpdateUserGroupInput{Name: &name})
	if err != nil {
		t.Fatalf("UpdateUserGroup: %v", err)
	}
	if updated.Name != "platform" {
		t.Fatalf("unexpected updated name %q", updated.Name)
	}

	if err := client.DeleteUserGroup(ctx, "ug1"); err != nil {
		t.Fatalf("DeleteUserGroup: %v", err)
	}
}

func TestDeviceGroupCRUD(t *testing.T) {
	t.Parallel()

	mux := http.NewServeMux()
	mux.HandleFunc("/api/v1/organizations/org1/device-groups", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method %s", r.Method)
		}
		var input tunnet.CreateDeviceGroupInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			t.Fatalf("decode create: %v", err)
		}
		_ = json.NewEncoder(w).Encode(tunnet.DeviceGroup{
			ID:             "dg1",
			OrganizationID: "org1",
			Name:           input.Name,
			NetworkID:      input.NetworkID,
			Description:    input.Description,
			Labels:         input.Labels,
		})
	})
	mux.HandleFunc("/api/v1/organizations/org1/device-groups/dg1", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			_ = json.NewEncoder(w).Encode(tunnet.DeviceGroup{
				ID:             "dg1",
				OrganizationID: "org1",
				Name:           "servers",
				NetworkID:      "net1",
			})
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Fatalf("unexpected method %s", r.Method)
		}
	})

	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	client, err := tunnet.NewClient(tunnet.ClientConfig{
		BaseURL:        server.URL,
		APIKey:         "key",
		OrganizationID: "org1",
		HTTPClient:     server.Client(),
	})
	if err != nil {
		t.Fatalf("NewClient: %v", err)
	}

	ctx := context.Background()
	created, err := client.CreateDeviceGroup(ctx, tunnet.CreateDeviceGroupInput{
		Name:      "servers",
		NetworkID: "net1",
	})
	if err != nil {
		t.Fatalf("CreateDeviceGroup: %v", err)
	}
	if created.ID != "dg1" {
		t.Fatalf("unexpected id %q", created.ID)
	}

	got, err := client.GetDeviceGroup(ctx, "dg1")
	if err != nil {
		t.Fatalf("GetDeviceGroup: %v", err)
	}
	if got.NetworkID != "net1" {
		t.Fatalf("unexpected network id %q", got.NetworkID)
	}

	if err := client.DeleteDeviceGroup(ctx, "dg1"); err != nil {
		t.Fatalf("DeleteDeviceGroup: %v", err)
	}
}
