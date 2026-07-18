# Fast local image: expects a Linux binary at target/release/tunnet-kube-node
# Base must match WSL glibc (Ubuntu 24.04+); bookworm is too old (GLIBC_2.38/2.39).
FROM ubuntu:24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY target/release/tunnet-kube-node /usr/local/bin/tunnet-kube-node

EXPOSE 8080

ENTRYPOINT ["tunnet-kube-node"]
