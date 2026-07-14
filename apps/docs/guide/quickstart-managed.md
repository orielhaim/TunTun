# Quick Start - Managed Mode

Managed mode is TunTun's full-featured deployment with a control plane, dashboard, SSO, access policies, and organization management. This is the mode for teams and organizations.

## 0. Install the agent

On every machine that will join the mesh make sure to install the agent first: [Installation](/guide/installation).

## 1. Set up the infrastructure

Create a `.env` file in the repository root:

```bash
DATABASE_URL=postgres://user:pass@localhost:5432/tuntun
BETTER_AUTH_SECRET=a-long-random-string-at-least-32-characters
BETTER_AUTH_URL=http://localhost:3000
MANAGEMENT_PORT=3000
MANAGEMENT_WEB_ORIGIN=http://localhost:5173
VITE_MANAGEMENT_API_URL=http://localhost:3000
CONTROL_PLANE_ADMIN_URL=http://127.0.0.1:9091
TUNTUN_SERVICE_SECRET=a-long-random-string-at-least-32-characters
TUNTUN_MANAGEMENT_URL=http://localhost:3000
TUNTUN_CONTROL_URL=http://127.0.0.1:8080
```

## 2. Start the stack

```bash
# Terminal 1 - Control plane (agents connect on :8080)
./target/release/tuntun-control

# Terminal 2 - Management API (:3000)
bun run dev:management

# Terminal 3 - Dashboard (:5173)
bun run dev:dash
```

## 3. Create an organization

Open the dashboard at `http://localhost:5173`, create an account, and create your first organization. A default network is created automatically.

## 4. Generate an enrollment token

Navigate to **Networks → Enrollment** (or **Machines → Add machine**) and generate an enrollment token.

## 5. Enroll a machine

On the machine you want to add:

```bash
sudo tuntun enroll \
  --control-url http://your-control-host:8080 \
  --token YOUR_ENROLLMENT_TOKEN
```

The machine gets an internal IP and joins the network.

## 6. Start the agent

```bash
sudo tuntun run
```

This creates the `tuntun0` virtual interface, connects to peers, and starts handling traffic.

## 7. Verify

```bash
tuntun status --peers
tuntun ping other-machine
```

From another enrolled machine, you can now `ping`, `curl`, or `ssh` using the mesh IP or hostname.
