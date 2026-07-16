# Multicast & Tags

You can send files to multiple machines at once by targeting a tag instead of a specific peer:

```bash
tunnet send ./build.tar.gz tag:ci
```

This sends the file to every machine with the `ci` tag. Each peer receives an independent transfer offer.

Multicast is useful for distributing build artifacts, configuration files, or data sets to groups of machines.
