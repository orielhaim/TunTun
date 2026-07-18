import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveOrganization } from "@/lib/auth-client";
import { useNetwork } from "@/lib/queries/management";

export const Route = createFileRoute("/app/networks/$networkId")({
  component: NetworkLayout,
});

function NetworkLayout() {
  const { networkId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: activeOrg } = useActiveOrganization();
  const { data: network, isPending } = useNetwork(activeOrg?.id, networkId);

  const tab = pathname.endsWith("/access")
    ? "access"
    : pathname.endsWith("/enrollment")
      ? "enrollment"
      : pathname.endsWith("/routes")
        ? "routes"
        : pathname.endsWith("/policy")
          ? "policy"
          : "overview";

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!network) {
    return <p className="text-muted-foreground text-sm">Network not found.</p>;
  }

  return (
    <div className="space-y-5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link to="/app/networks" />}>
              Networks
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRightIcon className="size-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{network.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Tabs value={tab}>
        <TabsList
          variant="line"
          className="w-full justify-start gap-0 border-b border-border/50 pb-0"
        >
          <TabsTrigger
            value="overview"
            className="px-3"
            render={
              <Link to="/app/networks/$networkId" params={{ networkId }} />
            }
          >
            Mesh
          </TabsTrigger>
          <TabsTrigger
            value="access"
            className="px-3"
            render={
              <Link
                to="/app/networks/$networkId/access"
                params={{ networkId }}
              />
            }
          >
            Access
          </TabsTrigger>
          <TabsTrigger
            value="routes"
            className="px-3"
            render={
              <Link
                to="/app/networks/$networkId/routes"
                params={{ networkId }}
              />
            }
          >
            Routes
          </TabsTrigger>
          <TabsTrigger
            value="policy"
            className="px-3"
            render={
              <Link
                to="/app/networks/$networkId/policy"
                params={{ networkId }}
              />
            }
          >
            Policy
          </TabsTrigger>
          <TabsTrigger
            value="enrollment"
            className="px-3"
            render={
              <Link
                to="/app/networks/$networkId/enrollment"
                params={{ networkId }}
              />
            }
          >
            Enrollment
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
