import { useQueryClient } from "@tanstack/react-query";
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
import { authClient } from "@/lib/auth-client";
import { slugifyOrganizationName } from "@/lib/slugify";

type CreateOrganizationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  showCloseButton?: boolean;
};

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
  showCloseButton = true,
}: CreateOrganizationDialogProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");

  function resetForm() {
    setName("");
    setLoading(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const slug = slugifyOrganizationName(trimmed);
    if (!slug) {
      toast.error("Organization name must contain letters or numbers");
      return;
    }

    setLoading(true);
    const { data, error } = await authClient.organization.create({
      name: trimmed,
      slug,
    });
    if (error || !data) {
      setLoading(false);
      toast.error(error?.message ?? "Failed to create organization");
      return;
    }

    const { error: activeError } = await authClient.organization.setActive({
      organizationId: data.id,
    });
    setLoading(false);

    if (activeError) {
      toast.error(activeError.message ?? "Failed to set active organization");
      return;
    }

    void queryClient.invalidateQueries();
    toast.success("Organization created");
    resetForm();
    onOpenChange(false);
    onCreated?.();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={showCloseButton}>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Organizations group your networks, machines, and team members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Acme Corp"
                required
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            {showCloseButton ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
              >
                Cancel
              </Button>
            ) : null}
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create organization"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
