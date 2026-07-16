import { useEffect, useState } from "react";
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

function formatUserCode(raw: string) {
  return raw.trim().replace(/-/g, "").toUpperCase();
}

function displayCode(code: string) {
  if (code.length === 8) return `${code.slice(0, 4)}-${code.slice(4)}`;
  return code;
}

function deviceErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;
  const e = error as {
    message?: string;
    error_description?: string;
    error?: string;
  };
  return e.error_description ?? e.message ?? e.error ?? fallback;
}

type Step = "enter" | "approve" | "done";

type AuthorizeCliDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode?: string;
};

export function AuthorizeCliDialog({
  open,
  onOpenChange,
  initialCode,
}: AuthorizeCliDialogProps) {
  const [userCode, setUserCode] = useState(initialCode ?? "");
  const [claimedCode, setClaimedCode] = useState("");
  const [step, setStep] = useState<Step>("enter");
  const [doneKind, setDoneKind] = useState<"approved" | "denied">("approved");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUserCode(initialCode ?? "");
    setClaimedCode("");
    setStep("enter");
    setLoading(false);

    const code = initialCode?.trim();
    if (!code) return;

    let cancelled = false;
    void (async () => {
      const formatted = formatUserCode(code);
      if (formatted.length < 4) return;
      setLoading(true);
      try {
        const { data, error } = await authClient.device({
          query: { user_code: formatted },
        });
        if (cancelled) return;
        if (error || !data) {
          toast.error(deviceErrorMessage(error, "Invalid or expired code"));
          return;
        }
        setClaimedCode(formatted);
        setUserCode(formatted);
        setStep("approve");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, initialCode]);

  async function claim(code: string) {
    const formatted = formatUserCode(code);
    if (formatted.length < 4) {
      toast.error("Enter the code shown in your terminal");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await authClient.device({
        query: { user_code: formatted },
      });
      if (error || !data) {
        toast.error(deviceErrorMessage(error, "Invalid or expired code"));
        return;
      }
      setClaimedCode(formatted);
      setUserCode(formatted);
      setStep("approve");
    } finally {
      setLoading(false);
    }
  }

  async function decide(approve: boolean) {
    if (!claimedCode) {
      toast.error("Missing device code");
      return;
    }
    setLoading(true);
    const result = approve
      ? await authClient.device.approve({ userCode: claimedCode })
      : await authClient.device.deny({ userCode: claimedCode });
    setLoading(false);
    if (result.error) {
      toast.error(deviceErrorMessage(result.error, "Request failed"));
      return;
    }
    setDoneKind(approve ? "approved" : "denied");
    setStep("done");
    if (approve) {
      toast.success("CLI authorized");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {step === "enter" ? (
          <>
            <DialogHeader>
              <DialogTitle>Authorize CLI</DialogTitle>
              <DialogDescription>
                Enter the device code from{" "}
                <code className="text-foreground">tunnet login</code> to link
                the CLI to your account.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void claim(userCode);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="cli-user-code">Device code</Label>
                <Input
                  id="cli-user-code"
                  value={userCode}
                  onChange={(e) => setUserCode(e.target.value)}
                  placeholder="ABCD-1234"
                  autoComplete="one-time-code"
                  autoFocus
                  className="font-mono tracking-widest uppercase"
                  maxLength={12}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Checking…" : "Continue"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : null}

        {step === "approve" ? (
          <>
            <DialogHeader>
              <DialogTitle>Approve Tunnet CLI?</DialogTitle>
              <DialogDescription>
                A device is requesting access to your Tunnet account.
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm">
              Code:{" "}
              <code className="font-mono tracking-widest">
                {displayCode(claimedCode)}
              </code>
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                disabled={loading}
                onClick={() => void decide(false)}
              >
                Deny
              </Button>
              <Button disabled={loading} onClick={() => void decide(true)}>
                {loading ? "Working…" : "Approve"}
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {step === "done" ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {doneKind === "approved" ? "CLI authorized" : "Request denied"}
              </DialogTitle>
              <DialogDescription>
                {doneKind === "approved"
                  ? "Return to your terminal - login should finish shortly."
                  : "The CLI will not receive access."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
