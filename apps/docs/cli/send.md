# tuntun send

Transfer files and directories over the mesh.

## Usage

```bash
tuntun send <path> <target> [--message <msg>]
tuntun send list
tuntun send accept <transfer_id>
tuntun send reject <transfer_id>
tuntun send history
tuntun send config [--consent <mode>] [--inbox <path>]
```

## Subcommands

`tuntun send <path> <target>` sends a file or directory to a peer. `<target>` can be a hostname, mesh IP, endpoint ID, or `tag:<name>` for multicast.

`tuntun send list` shows active and pending transfers.

`tuntun send accept <id>` accepts a pending inbound offer.

`tuntun send reject <id>` rejects a pending inbound offer.

`tuntun send history` shows completed transfers.

`tuntun send config` views or updates consent mode and inbox path.

## Examples

```bash
# Send a file
tuntun send ./report.pdf db-server

# Send a directory with a message
tuntun send ./photos laptop --message "vacation pics"

# Multicast to a tag
tuntun send ./build.tar.gz tag:ci

# Configure consent
tuntun send config --consent auto_accept --inbox ~/Downloads/tuntun
```
