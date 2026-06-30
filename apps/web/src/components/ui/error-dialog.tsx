"use client";

import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  dismissActionError,
  getActionError,
  navActionFor,
  subscribeActionError,
} from "@/lib/action-error";
import { resolveErrorMessage, toErrorTranslator } from "@/lib/errors";

/**
 * The app-wide blocking error modal (docs/UI.md → Error UX). Subscribes to the
 * action-error store and renders a clear, localized reason for any failed
 * action. Where an error has an obvious next step it offers a button — e.g.
 * `shift.not_open` → "Open a shift" → /shift. Unknown codes fall back to a
 * generic message plus the raw code for support. Mounted once in Providers.
 */

export function ErrorDialog() {
  const error = useSyncExternalStore(
    subscribeActionError,
    getActionError,
    getActionError,
  );
  const router = useRouter();
  const tErrors = useTranslations("errors");
  const tDialog = useTranslations("errors.dialog");
  const tActions = useTranslations("errors.dialog.actions");

  const open = error !== null;
  const code = error?.code ?? null;
  const known = code != null && tErrors.has(code);
  const message = resolveErrorMessage(toErrorTranslator(tErrors), code);
  const action = navActionFor(code);

  function close() {
    dismissActionError();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert
              size={18}
              aria-hidden="true"
              className="text-destructive"
            />
            {tDialog("title")}
          </DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>

        {code != null && !known ? (
          <p className="text-muted-foreground font-mono text-xs">
            {tDialog("codeLabel", { code })}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            {tDialog("close")}
          </Button>
          {action ? (
            <Button
              onClick={() => {
                close();
                router.push(action.href);
              }}
            >
              {tActions(action.labelKey)}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
