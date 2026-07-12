import { createFileRoute } from "@tanstack/react-router";
import { NetworkOverviewPage } from "@/components/app/network-overview";

export const Route = createFileRoute("/app/networks/$networkId/")({
  component: NetworkOverviewPage,
});
