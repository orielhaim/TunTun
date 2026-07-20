import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
  open,
  onOpenChange,
  tags,
  onSave,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: string[];
  onSave: (next: string[]) => Promise<void>;
  loading?: boolean;
}) {
  const [draft, setDraft] = useState<string[]>(tags);
  const [input, setInput] = useState("");

  function syncOpen(next: boolean) {
    if (next) {
      setDraft(tags);
      setInput("");
    }
    onOpenChange(next);
  }

  function addTag() {
    const name = input.trim().replace(/^tag:/, "").toLowerCase();
    if (!name) return;
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(name)) {
      toast.error("Invalid tag name");
      return;
    }
    if (!draft.includes(name)) {
      setDraft([...draft, name].sort());
    }
    setInput("");
  }

  return (
    <Dialog open={open} onOpenChange={syncOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit tags</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <MachineTagsList
            tags={draft}
            onTagClick={(tag) =>
              setDraft((prev) => prev.filter((t) => t !== tag))
            }
            empty="No tags assigned"
          />
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="tag-input">Add tag</Label>
              <Input
                id="tag-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="production"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              className="mt-6"
              variant="outline"
              onClick={addTag}
            >
              <PlusIcon className="size-4" />
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Click a tag to remove it from the draft. Tag must already be defined
            and you must own it.
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
  open,
  onOpenChange,
  onSubmit,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (add: string[]) => Promise<void>;
  loading?: boolean;
}) {
  const [input, setInput] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign tag to selected machines</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="bulk-tag">Tag</Label>
          <Input
            id="bulk-tag"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="production"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={loading || !input.trim()}
            onClick={() => {
              const name = input.trim().replace(/^tag:/, "").toLowerCase();
              void (async () => {
                try {
                  await onSubmit([name]);
                  toast.success("Tags assigned");
                  setInput("");
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
