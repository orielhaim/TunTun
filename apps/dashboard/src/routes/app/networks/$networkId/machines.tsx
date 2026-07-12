import { createFileRoute, redirect } from "@tanstack/react-router";

/** Machines list lives on the Mesh overview. */
export const Route = createFileRoute("/app/networks/$networkId/machines")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/networks/$networkId",
      params: { networkId: params.networkId },
    });
  },
});
