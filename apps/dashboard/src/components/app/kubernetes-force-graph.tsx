import type { KubernetesHubNode } from "@tunnet/api/management";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";

import { cn } from "@/lib/utils";

type GraphKind = "hub" | "k8s-node" | "subnet";

type GraphNode = NodeObject & {
  id: string;
  kind: GraphKind;
  label: string;
  secondary?: string | null;
  online?: boolean;
  nodeKind?: string;
  endpointId?: string;
  hubNode?: KubernetesHubNode;
  val: number;
};

type GraphLink = LinkObject & {
  id: string;
  source: string;
  target: string;
  kind: "hub" | "route";
};

const HUB_COLOR = "#0e7490";
const ONLINE_GREEN = "#22c55e";
const OFFLINE_SLATE = "#94a3b8";
const SUBNET_COLOR = "#34d399";

const KIND_RING_COLOR: Record<string, string> = {
  "k8s-connector": "#0e7490",
  "k8s-ingress": "#0369a1",
  "k8s-tunnel": "#b45309",
  "k8s-egress": "#7c3aed",
  "k8s-sidecar": "#64748b",
  k8s: "#0e7490",
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function pinLayout(nodes: GraphNode[]) {
  const hub = nodes.find((n) => n.kind === "hub");
  if (hub) {
    hub.x = 0;
    hub.y = 0;
    hub.fx = 0;
    hub.fy = 0;
  }
  const k8s = nodes.filter((n) => n.kind === "k8s-node");
  const subnets = nodes.filter((n) => n.kind === "subnet");
  const ring = 120;
  k8s.forEach((node, i) => {
    const angle =
      k8s.length === 1
        ? -Math.PI / 2
        : (2 * Math.PI * i) / k8s.length - Math.PI / 2;
    node.fx = Math.cos(angle) * ring;
    node.fy = Math.sin(angle) * ring;
    node.x = node.fx;
    node.y = node.fy;
  });
  const outer = 190;
  subnets.forEach((node, i) => {
    const angle =
      subnets.length === 1
        ? Math.PI / 2
        : (2 * Math.PI * i) / subnets.length + Math.PI / 6;
    node.fx = Math.cos(angle) * outer;
    node.fy = Math.sin(angle) * outer;
    node.x = node.fx;
    node.y = node.fy;
  });
}

export function KubernetesForceGraph({
  nodes,
  networkName,
  onSelect,
  className,
}: {
  nodes: KubernetesHubNode[];
  networkName: string;
  onSelect?: (node: KubernetesHubNode | null) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [viewReady, setViewReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      setSize({
        w: Math.max(320, Math.floor(width)),
        h: Math.max(280, Math.floor(height)),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const gNodes: GraphNode[] = [
      {
        id: "hub:network",
        kind: "hub",
        label: networkName,
        secondary: "Network",
        online: true,
        val: 1,
      },
    ];
    const gLinks: GraphLink[] = [];

    for (const n of nodes) {
      const id = `k8s:${n.endpointId}`;
      gNodes.push({
        id,
        kind: "k8s-node",
        label: n.name,
        secondary: n.meshIp,
        online: n.online,
        nodeKind: String(n.kind),
        endpointId: n.endpointId,
        hubNode: n,
        val: 1,
      });
      gLinks.push({
        id: `hub-${id}`,
        source: "hub:network",
        target: id,
        kind: "hub",
      });
      for (const route of n.subnetRoutes.filter((r) => r.enabled)) {
        const cidrId = `subnet:${n.endpointId}:${route.cidr}`;
        gNodes.push({
          id: cidrId,
          kind: "subnet",
          label: route.cidr,
          secondary: "CIDR",
          online: true,
          val: 1,
        });
        gLinks.push({
          id: `route-${cidrId}`,
          source: id,
          target: cidrId,
          kind: "route",
        });
      }
    }

    pinLayout(gNodes);
    return { nodes: gNodes, links: gLinks };
  }, [nodes, networkName]);

  const fitViewport = useCallback(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge", null);
    fg.d3Force("center", null);
    fg.d3Force("link", null);
    if (graphData.nodes.length <= 1) {
      fg.centerAt(0, 0, 0);
      fg.zoom(3, 0);
    } else {
      fg.zoomToFit(0, 80);
    }
    setViewReady(true);
  }, [graphData.nodes.length]);

  useEffect(() => {
    setViewReady(false);
    const t = window.setTimeout(fitViewport, 40);
    return () => window.clearTimeout(t);
  }, [fitViewport]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "bg-muted/20 relative h-[420px] w-full overflow-hidden sm:h-[520px]",
        className,
      )}
    >
      {size ? (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={graphData}
          cooldownTicks={0}
          enableNodeDrag={false}
          linkColor={(link) =>
            (link as GraphLink).kind === "route"
              ? "rgba(52, 211, 153, 0.55)"
              : "rgba(14, 116, 144, 0.4)"
          }
          linkWidth={1.2}
          onNodeClick={(node) => {
            const n = node as GraphNode;
            if (n.hubNode) onSelect?.(n.hubNode);
            else onSelect?.(null);
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const n = node as GraphNode;
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            const scale = globalScale;

            if (n.kind === "hub") {
              const r = 16;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fillStyle = HUB_COLOR;
              ctx.fill();
              const fontSize = Math.max(10 / scale, 3.2);
              ctx.font = `600 ${fontSize}px Geist Variable, ui-sans-serif, system-ui`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "rgba(71, 85, 105, 0.95)";
              ctx.fillText(n.label, x, y + r + 6);
              return;
            }

            if (n.kind === "subnet") {
              const r = 6;
              ctx.beginPath();
              ctx.arc(x, y, r, 0, Math.PI * 2);
              ctx.fillStyle = SUBNET_COLOR;
              ctx.fill();
              const fontSize = Math.max(9 / scale, 2.8);
              ctx.font = `${fontSize}px Geist Mono Variable, ui-monospace, monospace`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "rgba(100, 116, 139, 0.95)";
              ctx.fillText(n.label, x, y + r + 4);
              return;
            }

            const online = Boolean(n.online);
            const accent =
              KIND_RING_COLOR[n.nodeKind ?? "k8s"] ?? KIND_RING_COLOR.k8s!;
            const name = n.label;
            const ip = n.secondary ?? "-";
            const nameSize = Math.max(11 / scale, 3.4);
            const ipSize = Math.max(9 / scale, 2.8);
            ctx.font = `600 ${nameSize}px Geist Variable, ui-sans-serif, system-ui`;
            const nameW = ctx.measureText(name).width;
            ctx.font = `${ipSize}px Geist Mono Variable, ui-monospace, monospace`;
            const ipW = ctx.measureText(ip).width;
            const padX = 10 / scale;
            const padY = 8 / scale;
            const pip = 4.5 / scale;
            const gap = 6 / scale;
            const cardW = Math.max(nameW, ipW) + pip + gap + padX * 2;
            const cardH = nameSize + ipSize + 4 / scale + padY * 2;
            const cardX = x - cardW / 2;
            const cardY = y - cardH / 2;

            roundRect(ctx, cardX, cardY, cardW, cardH, 5 / scale);
            ctx.fillStyle = online ? "#ffffff" : "rgba(248, 250, 252, 0.95)";
            ctx.fill();
            ctx.strokeStyle = accent;
            ctx.lineWidth = 1.4 / scale;
            ctx.stroke();
            ctx.fillStyle = accent;
            ctx.fillRect(
              cardX,
              cardY + 2 / scale,
              3 / scale,
              cardH - 4 / scale,
            );

            const textTop = cardY + padY;
            ctx.beginPath();
            ctx.arc(
              cardX + padX + pip / 2,
              textTop + nameSize / 2,
              pip / 2,
              0,
              Math.PI * 2,
            );
            ctx.fillStyle = online ? ONLINE_GREEN : OFFLINE_SLATE;
            ctx.fill();

            const textX = cardX + padX + pip + gap;
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.font = `600 ${nameSize}px Geist Variable, ui-sans-serif, system-ui`;
            ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
            ctx.fillText(name, textX, textTop);
            ctx.font = `${ipSize}px Geist Mono Variable, ui-monospace, monospace`;
            ctx.fillStyle = "rgba(100, 116, 139, 0.95)";
            ctx.fillText(ip, textX, textTop + nameSize + 3 / scale);
          }}
          nodePointerAreaPaint={(node, color, ctx) => {
            const n = node as GraphNode;
            const x = n.x ?? 0;
            const y = n.y ?? 0;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, n.kind === "hub" ? 18 : 28, 0, Math.PI * 2);
            ctx.fill();
          }}
        />
      ) : null}
      {!viewReady ? (
        <div className="bg-background/40 absolute inset-0 animate-pulse" />
      ) : null}
    </div>
  );
}
