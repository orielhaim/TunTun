# tunnet send

Transfer files and directories over the mesh.

## Usage

```bash
tunnet send <path> <target> [--message <msg>]
tunnet send list
tunnet send accept <transfer_id>
tunnet send reject <transfer_id>
tunnet send history
tunnet send config [--consent <mode>] [--inbox <path>]
```

## Subcommands

`tunnet send <path> <target>` sends a file or directory to a peer. `<target>` can be a hostname, mesh IP, endpoint ID, or `tag:<name>` for multicast.

`tunnet send list` shows active and pending transfers.

`tunnet send accept <id>` accepts a pending inbound offer.

`tunnet send reject <id>` rejects a pending inbound offer.

`tunnet send history` shows completed transfers.

`tunnet send config` views or updates consent mode and inbox path.

## Examples

```bash
# Send a file
tunnet send ./report.pdf db-server

# Send a directory with a message
tunnet send ./photos laptop --message "vacation pics"

# Multicast to a tag
tunnet send ./build.tar.gz tag:ci

# Configure consent
tunnet send config --consent auto_accept --inbox ~/Downloads/tunnet
```
