import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/networks/$networkId/map")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/networks/$networkId",
      params: { networkId: params.networkId },
    });
  },
});
