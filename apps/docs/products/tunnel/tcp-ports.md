# TCP Port Mappings

In addition to HTTPS tunnels, Tunnet supports raw TCP port mappings. A TCP port mapping binds a public port on the relay to a local port on the agent machine.

## Use case

You need to expose a database (port 5432) or a game server (custom port) to the internet without wrapping it in HTTP. TCP port mappings let you bind `relay.example.com:25565` to `localhost:25565` on your machine.

## Configuration

TCP port mappings are configured on the tunnel detail page in the dashboard. Each mapping specifies an external port on the relay and a target port on the agent (optionally on a different mesh IP).
