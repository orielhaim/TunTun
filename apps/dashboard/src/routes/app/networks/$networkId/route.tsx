import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
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
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/networks/$networkId")({
  component: NetworkLayout,
});

function NetworkLayout() {
  const { networkId } = Route.useParams();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: activeOrg } = useActiveOrganization();
  const { data: network, isPending } = useNetwork(activeOrg?.id, networkId);

  const base = `/app/networks/${networkId}`;
  const tab = pathname.endsWith("/access")
    ? "access"
    : pathname.endsWith("/enrollment")
      ? "enrollment"
      : pathname.endsWith("/machines")
        ? "machines"
        : "overview";

  if (isPending) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (!network) {
    return <p className="text-muted-foreground text-sm">Network not found.</p>;
  }

  return (
    <div className="space-y-6">
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

      <PageHeader
        title={network.name}
        description={`${network.cidr} · MTU ${network.mtu}`}
      />

      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="overview" render={<Link to={base} />}>
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="machines"
            render={<Link to={`${base}/machines`} />}
          >
            Machines
          </TabsTrigger>
          <TabsTrigger value="access" render={<Link to={`${base}/access`} />}>
            Access
          </TabsTrigger>
          <TabsTrigger
            value="enrollment"
            render={<Link to={`${base}/enrollment`} />}
          >
            Enrollment
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <Outlet />
    </div>
  );
}
