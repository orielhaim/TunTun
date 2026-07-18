# Fast local image: expects a Linux binary at target/release/tunnet-operator
# Base must match WSL glibc (Ubuntu 24.04+); bookworm is too old (GLIBC_2.38/2.39).
FROM ubuntu:24.04

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY target/release/tunnet-operator /usr/local/bin/tunnet-operator

EXPOSE 8080 9443

ENTRYPOINT ["tunnet-operator"]
CMD ["run"]
