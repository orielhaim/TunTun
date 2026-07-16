import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CopyField } from "@/components/app/copy-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getControlPlaneUrl } from "@/lib/env";
import { useRelayMutations, useRelays } from "@/lib/queries/management";

type RegisterRelayDialogProps = {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RegisterRelayDialog({
  orgId,
  open,
  onOpenChange,
}: RegisterRelayDialogProps) {
  const { create } = useRelayMutations(orgId);
  const { data: relays } = useRelays(orgId);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("unknown");
  const [domain, setDomain] = useState("");
  const [publicIp, setPublicIp] = useState("");
  const [capacity, setCapacity] = useState("100");
  const [registrationToken, setRegistrationToken] = useState<string | null>(
    null,
  );
  const [createdRelayId, setCreatedRelayId] = useState<string | null>(null);

  const createdRelay = relays?.find((r) => r.id === createdRelayId);
  const isHealthy = createdRelay?.status === "healthy";

  useEffect(() => {
    if (!createdRelayId || !isHealthy) return;
    toast.success("Relay connected and healthy");
  }, [createdRelayId, isHealthy]);

  function reset() {
    setName("");
    setRegion("unknown");
    setDomain("");
    setPublicIp("");
    setCapacity("100");
    setRegistrationToken(null);
    setCreatedRelayId(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        region: region.trim() || "unknown",
        domain: domain.trim(),
        publicIp: publicIp.trim() || undefined,
        capacityLimit: Number(capacity) || 100,
        kind: "self_hosted",
      });
      setRegistrationToken(result.registrationToken);
      setCreatedRelayId(result.relay.id);
      toast.success("Relay registered - copy the token before closing");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to register relay",
      );
    }
  }

  const command = registrationToken
    ? `tunnet-relay register --control-url ${getControlPlaneUrl()} --token ${registrationToken}`
    : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {registrationToken ? (
          <>
            <DialogHeader>
              <DialogTitle>Relay registration token</DialogTitle>
              <DialogDescription>
                Run this command on your relay host. The token is shown only
                once.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <CopyField label="Registration token" value={registrationToken} />
              <CopyField label="Register command" value={command} />
              {isHealthy ? (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                  ✓ Connected - relay is healthy
                </p>
              ) : (
                <p className="text-muted-foreground text-xs">
                  Waiting for relay to connect… status updates automatically.
                </p>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)}>
            <DialogHeader>
              <DialogTitle>Register relay</DialogTitle>
              <DialogDescription>
                Add a self-hosted relay that terminates public tunnels for your
                organization. Point wildcard DNS{" "}
                <span className="font-mono">*.your-domain</span> at the relay
                IP. Provide TLS via{" "}
                <span className="font-mono">--cert/--key</span> or{" "}
                <span className="font-mono">--acme-domain</span> (HTTP-01,
                non-wildcard).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="relay-name">Name</Label>
                <Input
                  id="relay-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="eu-relay-1"
                  pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relay-region">Region</Label>
                <Input
                  id="relay-region"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="eu-west"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relay-domain">Domain</Label>
                <Input
                  id="relay-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="tunnel.example.com"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relay-ip">Public IP (optional)</Label>
                <Input
                  id="relay-ip"
                  value={publicIp}
                  onChange={(e) => setPublicIp(e.target.value)}
                  placeholder="203.0.113.5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relay-capacity">Capacity</Label>
                <Input
                  id="relay-capacity"
                  type="number"
                  min={1}
                  max={100000}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Registering..." : "Register relay"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
