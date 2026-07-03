import { useState } from "react";
import { toast } from "sonner";

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
import { useNetworkMutations } from "@/lib/queries/management";

type CreateNetworkDialogProps = {
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CreateNetworkDialog({
  orgId,
  open,
  onOpenChange,
}: CreateNetworkDialogProps) {
  const { create } = useNetworkMutations(orgId);
  const [name, setName] = useState("");
  const [cidr, setCidr] = useState("10.7.0.0/24");
  const [mtu, setMtu] = useState("1280");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        name: name.trim(),
        cidr,
        mtu: Number(mtu) || 1280,
      });
      toast.success("Network created");
      setName("");
      setCidr("10.7.0.0/24");
      setMtu("1280");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create network",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Create network</DialogTitle>
            <DialogDescription>
              Networks define the virtual address space for your machines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="network-name">Name</Label>
              <Input
                id="network-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="production"
                pattern="[a-z0-9-]{3,32}"
                required
              />
              <p className="text-muted-foreground text-xs">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-cidr">CIDR</Label>
              <Input
                id="network-cidr"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="network-mtu">MTU</Label>
              <Input
                id="network-mtu"
                type="number"
                min={576}
                max={9000}
                value={mtu}
                onChange={(e) => setMtu(e.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create network"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
