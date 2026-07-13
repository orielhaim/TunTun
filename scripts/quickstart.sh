#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}
  ████████╗██╗   ██╗███╗   ██╗████████╗██╗   ██╗███╗   ██╗
  ╚══██╔══╝██║   ██║████╗  ██║╚══██╔══╝██║   ██║████╗  ██║
     ██║   ██║   ██║██╔██╗ ██║   ██║   ██║   ██║██╔██╗ ██║
     ██║   ██║   ██║██║╚██╗██║   ██║   ██║   ██║██║╚██╗██║
     ██║   ╚██████╔╝██║ ╚████║   ██║   ╚██████╔╝██║ ╚████║
     ╚═╝    ╚═════╝ ╚═╝  ╚═══╝   ╚═╝    ╚═════╝ ╚═╝  ╚═══╝
${NC}"
echo -e "${GREEN}Quickstart${NC}\n"

if [ ! -f .env ]; then
    echo -e "${CYAN}→ Generating .env with random secrets...${NC}"
    SERVICE_SECRET=$(openssl rand -hex 32)
    AUTH_SECRET=$(openssl rand -hex 32)
    cat > .env <<EOF
TUNTUN_SERVICE_SECRET=${SERVICE_SECRET}
BETTER_AUTH_SECRET=${AUTH_SECRET}
EOF
    echo -e "${GREEN}  .env created${NC}"
else
    echo -e "${GREEN}  .env already exists, skipping${NC}"
fi

echo -e "\n${CYAN}→ Building containers (first run takes ~5 min)...${NC}"
docker compose build

echo -e "\n${CYAN}→ Starting stack...${NC}"
docker compose up -d

echo -e "\n${CYAN}→ Waiting for services...${NC}"
for svc in postgres control management; do
    printf "  %-15s " "$svc"
    timeout 120 bash -c "
        until docker compose ps $svc --format '{{.Health}}' 2>/dev/null | grep -q 'healthy'; do
            sleep 2
        done
    " && echo -e "${GREEN}✓${NC}" || echo -e "${RED}✗${NC}"
done

echo -e "
${GREEN}══════════════════════════════════════════════════${NC}
  Dashboard   →  ${CYAN}http://localhost:5173${NC}
  Management  →  ${CYAN}http://localhost:3000${NC}
  Control     →  ${CYAN}http://localhost:8080${NC}
  Postgres    →  ${CYAN}localhost:5432${NC}
${GREEN}══════════════════════════════════════════════════${NC}

  ${CYAN}Next steps:${NC}
  1. Open ${CYAN}http://localhost:5173${NC} and create an account
  2. Create an organization and network
  3. Generate an enrollment token
  4. Enroll a machine:

     ${CYAN}sudo tuntun enroll \\
       --control-url http://<your-ip>:8080 \\
       --token <YOUR_TOKEN>${NC}

     ${CYAN}sudo tuntun run${NC}
"
