import type { TopologyEdge, TopologyNode } from "@tuntun/api/management";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-2d";

import { cn } from "@/lib/utils";

type GraphKind = TopologyNode["kind"] | "hub";

type GraphNode = NodeObject &
  Omit<TopologyNode, "kind"> & {
    kind: GraphKind;
    val: number;
  };

type GraphLink = LinkObject &
  TopologyEdge & {
    curvature?: number;
  };

const KIND_COLOR: Record<GraphKind, string> = {
  hub: "#f5a524",
  machine: "#e8eaed",
  subnet: "#34d399",
  hostname: "#38bdf8",
  exit: "#fbbf24",
};

const EDGE_COLOR: Record<TopologyEdge["kind"] | "hub", string> = {
  hub: "rgba(245, 165, 36, 0.35)",
  peer: "#22c55e",
  subnet: "#34d39988",
  hostname: "#38bdf888",
  exit: "#fbbf2488",
};

function nodeRadius(node: GraphNode): number {
  if (node.kind === "hub") return 14;
  if (node.kind === "machine") return node.online ? 7 : 5;
  if (node.kind === "exit") return 8;
  return 6;
}

function linkSourceId(link: GraphLink): string {
  const source = link.source;
  if (source == null) return "";
  if (typeof source === "object") {
    return String((source as { id?: string | number }).id ?? "");
  }
  return String(source);
}

export function NetworkForceGraph({
  nodes,
  edges,
  onSelect,
  className,
  heightClassName,
  showHub = true,
  statusFilter = "all",
  kindFilter = "all",
}: {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  onSelect?: (node: TopologyNode | null) => void;
  className?: string;
  heightClassName?: string;
  showHub?: boolean;
  statusFilter?: "all" | "online" | "offline";
  kindFilter?: "all" | TopologyNode["kind"];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(
    undefined,
  );
  const [size, setSize] = useState({ w: 800, h: 380 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({
        w: Math.max(320, Math.floor(width)),
        h: Math.max(260, Math.floor(height)),
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      if (kindFilter !== "all" && n.kind !== kindFilter) return false;
      if (n.kind === "machine") {
        if (statusFilter === "online" && !n.online) return false;
        if (statusFilter === "offline" && n.online) return false;
      } else if (statusFilter !== "all") {
        // Keep non-machines when filtering status only if attached via visible machine
        return true;
      }
      return true;
    });
  }, [nodes, statusFilter, kindFilter]);

  const visibleIds = useMemo(
    () => new Set(filteredNodes.map((n) => n.id)),
    [filteredNodes],
  );

  const graphData = useMemo(() => {
    const gNodes: GraphNode[] = filteredNodes.map((n) => ({
      ...n,
      val:
        n.kind === "machine"
          ? n.online
            ? 1.4
            : 0.8
          : n.kind === "exit"
            ? 1.6
            : 1,
    }));

    const gLinks: GraphLink[] = edges
      .filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target))
      .map((e) => ({
        ...e,
        curvature: e.kind === "peer" ? 0.12 : 0.05,
      }));

    if (showHub) {
      const hubId = "hub:tuntun";
      gNodes.unshift({
        id: hubId,
        kind: "hub",
        label: "TunTun",
        secondary: "Control plane",
        val: 3,
        online: true,
      });
      for (const n of filteredNodes) {
        if (n.kind !== "machine") continue;
        gLinks.push({
          id: `hub-edge:${n.id}`,
          source: hubId,
          target: n.id,
          kind: "peer",
          intensity: n.online ? 0.55 : 0.2,
          curvature: 0.08,
          direct: true,
        });
      }
    }

    return { nodes: gNodes, links: gLinks };
  }, [filteredNodes, edges, visibleIds, showHub]);

  const paintNode = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const r = nodeRadius(node);
      const x = node.x ?? 0;
      const y = node.y ?? 0;

      if (node.kind === "hub") {
        const glow = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 1.8);
        glow.addColorStop(0, "rgba(245, 165, 36, 0.12)");
        glow.addColorStop(0.55, "rgba(245, 165, 36, 0.04)");
        glow.addColorStop(1, "rgba(245, 165, 36, 0)");
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = "#f5a524";
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 220, 160, 0.55)";
        ctx.lineWidth = 1.25;
        ctx.stroke();

        const fontSize = Math.max(11 / globalScale, 3.6);
        ctx.font = `600 ${fontSize}px Geist Variable, ui-sans-serif, system-ui`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(20, 16, 8, 0.92)";
        ctx.fillText("T", x, y + 0.5);

        ctx.font = `${Math.max(10 / globalScale, 3.2)}px Geist Variable, ui-sans-serif`;
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(245, 200, 120, 0.75)";
        ctx.fillText("TunTun", x, y + r + 3);
        return;
      }

      if (node.kind === "machine" && node.online) {
        ctx.beginPath();
        ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(52, 211, 153, 0.18)";
        ctx.fill();
      }

      ctx.beginPath();
      if (node.kind === "subnet") {
        ctx.rect(x - r, y - r, r * 2, r * 2);
      } else if (node.kind === "hostname") {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else if (node.kind === "exit") {
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        ctx.arc(x, y, r, 0, Math.PI * 2);
      }

      ctx.fillStyle =
        node.kind === "machine" && !node.online
          ? "rgba(148, 163, 184, 0.45)"
          : KIND_COLOR[node.kind];
      ctx.fill();

      if (node.kind === "machine") {
        ctx.strokeStyle = node.online
          ? "rgba(52, 211, 153, 0.9)"
          : "rgba(100, 116, 139, 0.7)";
        ctx.lineWidth = 1.25;
        ctx.stroke();

        // Status pip
        ctx.beginPath();
        ctx.arc(x + r * 0.65, y - r * 0.65, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = node.online ? "#34d399" : "#64748b";
        ctx.fill();
      }

      const label = node.label;
      const fontSize = Math.max(10 / globalScale, 3.2);
      ctx.font = `${fontSize}px Geist Variable, ui-sans-serif, system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "rgba(226, 232, 240, 0.85)";
      ctx.fillText(label, x, y + r + 2.5);
    },
    [],
  );

  const linkColor = useCallback((link: GraphLink) => {
    const sourceId = linkSourceId(link);
    if (sourceId.startsWith("hub:")) return EDGE_COLOR.hub;
    if (link.kind === "peer") {
      return link.direct === false ? "#eab308" : EDGE_COLOR.peer;
    }
    return EDGE_COLOR[link.kind];
  }, []);

  const linkWidth = useCallback((link: GraphLink) => {
    if (linkSourceId(link).startsWith("hub:")) return 0.8;
    return 0.6 + (link.intensity ?? 0.35) * 1.8;
  }, []);

  const linkParticles = useCallback((link: GraphLink) => {
    if (linkSourceId(link).startsWith("hub:")) return 2;
    if (link.kind !== "peer")
      return Math.round(1 + (link.intensity ?? 0.3) * 2);
    return Math.max(1, Math.round((link.intensity ?? 0.35) * 6));
  }, []);

  const linkParticleSpeed = useCallback((link: GraphLink) => {
    return 0.004 + (link.intensity ?? 0.35) * 0.012;
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "mesh-surface relative w-full overflow-hidden rounded-lg border border-border/60",
        heightClassName ?? "h-[340px] sm:h-[400px]",
        className,
      )}
    >
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeId="id"
        linkSource="source"
        linkTarget="target"
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(node, color, ctx) => {
          const r = nodeRadius(node as GraphNode) + 4;
          ctx.beginPath();
          ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkCurvature="curvature"
        linkDirectionalParticles={linkParticles}
        linkDirectionalParticleSpeed={linkParticleSpeed}
        linkDirectionalParticleWidth={(link) =>
          1.2 + ((link as GraphLink).intensity ?? 0.3) * 2
        }
        linkDirectionalParticleColor={linkColor}
        cooldownTicks={90}
        onNodeClick={(node) => {
          const n = node as GraphNode;
          if (n.kind === "hub") {
            onSelect?.(null);
            return;
          }
          onSelect?.(n as TopologyNode);
        }}
        onBackgroundClick={() => onSelect?.(null)}
        enableNodeDrag
      />
    </div>
  );
}
