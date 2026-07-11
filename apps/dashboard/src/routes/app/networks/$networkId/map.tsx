import { redirect, createFileRoute } from "@tanstack/react-router";

/** Map lives on the Mesh overview — keep URL for bookmarks. */
export const Route = createFileRoute("/app/networks/$networkId/map")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/app/networks/$networkId",
      params: { networkId: params.networkId },
    });
  },
});
