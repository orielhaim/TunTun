import { useEffect, useState } from "react";

import { AssertionBuilder } from "@/components/app/posture/assertion-builder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type AssertionRow,
  createEmptyAssertionRow,
  type PostureDefinition,
  parseAssertionsToRows,
  serializeAssertionRows,
} from "@/lib/posture-types";

const DEFAULT_ASSERTIONS = [
  "device:diskEncryption == true",
  "device:firewallEnabled == true",
];

export function DefinitionFormSheet({
  open,
  onOpenChange,
  editing,
  loading,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: PostureDefinition | null;
  loading: boolean;
  onSubmit: (values: {
    name: string;
    description?: string;
    assertions: string[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<AssertionRow[]>(() =>
    parseAssertionsToRows(DEFAULT_ASSERTIONS),
  );

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setDescription(editing?.description ?? "");
    setRows(
      editing
        ? parseAssertionsToRows(editing.assertions)
        : parseAssertionsToRows(DEFAULT_ASSERTIONS),
    );
  }, [open, editing]);

  const assertions = serializeAssertionRows(rows);
  const canSubmit = Boolean(name.trim()) && assertions.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl!"
      >
        <SheetHeader className="border-b border-border/60 px-6 py-4 text-left">
          <SheetTitle className="text-base">
            {editing ? "Edit definition" : "Create definition"}
          </SheetTitle>
          <SheetDescription>
            Build compliance rules from device attributes. Each rule is
            evaluated against agent-reported posture.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="posture-name">Name</Label>
            <Input
              id="posture-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={Boolean(editing)}
              placeholder="secure-workstation"
            />
            {editing ? (
              <p className="text-muted-foreground text-[11px]">
                Names cannot be changed after creation.
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="posture-description">Description</Label>
            <Input
              id="posture-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Requires encryption and firewall"
            />
          </div>

          <AssertionBuilder rows={rows} onChange={setRows} />

          {assertions.length === 0 ? (
            <p className="text-destructive text-xs" role="alert">
              Add at least one valid rule before saving.
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border/60 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={loading || !canSubmit}
            onClick={() => {
              if (assertions.length === 0) {
                setRows([createEmptyAssertionRow()]);
                return;
              }
              void onSubmit({
                name: name.trim(),
                description: description.trim() || undefined,
                assertions,
              });
            }}
          >
            {loading ? "Saving…" : editing ? "Save changes" : "Create"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
