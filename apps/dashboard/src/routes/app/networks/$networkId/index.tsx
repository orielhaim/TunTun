import { NetworkOverviewPage } from "@/components/app/network-overview";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/networks/$networkId/")({
  component: NetworkOverviewPage,
});
