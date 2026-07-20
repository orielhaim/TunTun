import { useState } from "react";
import { toast } from "sonner";
import { TagMultiCombobox } from "@/components/app/tag-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function MachineTagsList({
  tags,
  onTagClick,
  className,
  empty = "No tags",
}: {
  tags: string[];
  onTagClick?: (tag: string) => void;
  className?: string;
  empty?: string;
}) {
  if (tags.length === 0) {
    return <span className="text-muted-foreground text-xs">{empty}</span>;
  }
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className="bg-muted hover:bg-muted/80 rounded px-1.5 py-0.5 font-mono text-[11px]"
          onClick={() => onTagClick?.(tag)}
        >
          tag:{tag}
        </button>
      ))}
    </div>
  );
}

export function MachineTagsEditor({
  orgId,
  open,
  onOpenChange,
  tags,
  onSave,
  loading,
}: {
  orgId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  onSave: (next: string[]) => Promise<void>;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(tags);

  function syncOpen(next: boolean) {
    if (next) {
      setDraft(tags);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={syncOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="machine-tags">Tags</Label>
            <TagMultiCombobox
              id="machine-tags"
              orgId={orgId}
              value={draft}
              onValueChange={setDraft}
              placeholder="Search tags…"
              disabled={loading}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            Choose from defined tags you are allowed to assign.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => syncOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading}
            onClick={() => {
              void (async () => {
                try {
                  await onSave(draft);
                  toast.success("Tags updated");
                  syncOpen(false);
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to update tags",
                  );
                }
              })();
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkTagsDialog({
  orgId,
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  orgId: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (add: string[]) => Promise<void>;
  loading?: boolean;
}) {
  const [tags, setTags] = useState<string[]>([]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setTags([]);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign tags to selected machines</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="bulk-tags">Tags</Label>
          <TagMultiCombobox
            id="bulk-tags"
            orgId={orgId}
            value={tags}
            onValueChange={setTags}
            placeholder="Search tags…"
            disabled={loading}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading || tags.length === 0}
            onClick={() => {
              void (async () => {
                try {
                  await onSubmit(tags);
                  toast.success("Tags assigned");
                  setTags([]);
                  onOpenChange(false);
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to assign",
                  );
                }
              })();
            }}
          >
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
