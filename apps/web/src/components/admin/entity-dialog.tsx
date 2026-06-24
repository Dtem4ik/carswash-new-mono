"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";

export interface EntityValues {
  name: string;
  sort: number;
}

/**
 * Create/edit dialog for the simple catalog entities (service = name only;
 * car type / box = name + sort). Built on RHF + Zod; on submit it calls the
 * caller's mutation and surfaces an API error code inline. Resets to the given
 * initial values whenever it (re)opens.
 */
export function EntityDialog({
  open,
  onOpenChange,
  title,
  withSort,
  initial,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  withSort: boolean;
  initial: EntityValues;
  pending: boolean;
  onSubmit: (values: EntityValues) => Promise<void>;
}) {
  const t = useTranslations("admin");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");

  const schema = z.object({
    name: z.string().trim().min(1, t("nameRequired")),
    sort: z.coerce.number().int().min(0),
  });

  const form = useForm<EntityValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });

  // RHF keeps the first defaultValues; re-seed each time the dialog opens so
  // editing a different row (or switching create↔edit) shows the right values.
  // Intentionally keyed on `open` only — `initial` is a fresh object each render
  // and would otherwise clobber in-progress edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed on open only
  useEffect(() => {
    if (open) form.reset(initial);
  }, [open]);

  async function submit(values: EntityValues) {
    try {
      await onSubmit(values);
      onOpenChange(false);
    } catch (error) {
      form.setError("root", {
        message: resolveErrorMessage(
          toErrorTranslator(tErrors),
          extractErrorCode(error) ?? "unknown",
        ),
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("name")}</FormLabel>
                  <FormControl>
                    <Input
                      autoFocus
                      placeholder={t("namePlaceholder")}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {withSort ? (
              <FormField
                control={form.control}
                name="sort"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sort")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="font-mono"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : null}

            {form.formState.errors.root ? (
              <p className="text-destructive text-sm" role="alert">
                {form.formState.errors.root.message}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {tCommon("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("saving") : tCommon("save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
