"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Search, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { LicensePlate } from "@/components/license-plate";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBoxes } from "@/hooks/use-board-data";
import {
  useCarSearch,
  useCarTypes,
  useClientSearch,
  usePackagePrices,
  usePackages,
  useServicePrices,
  useServices,
  useStaff,
} from "@/hooks/use-catalog";
import { type OrderCreate, useCreateOrder } from "@/hooks/use-orders";
import {
  extractErrorCode,
  resolveErrorMessage,
  toErrorTranslator,
} from "@/lib/errors";
import { useFormatters } from "@/lib/format";
import {
  computeOrderPreview,
  packagePriceMap,
  servicePriceMap,
} from "@/lib/pricing";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

const CLIENT_KINDS = ["regular", "corporate"] as const;
const DISCOUNT_TYPES = ["manual", "loyalty", "promo", "subscription"] as const;

/**
 * Order intake: vehicle (walk-in or registered lookup), priced services and/or a
 * package with a live client-side preview, discount, washers, and a box. The
 * server stays authoritative on submit; API error codes map to inline messages.
 */
export function OrderIntakeForm() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const country = activeCarWash?.country ?? null;

  const router = useRouter();
  const t = useTranslations("intake");
  const tErrors = useTranslations("errors");
  const tClientKind = useTranslations("clientKind");
  const tDiscount = useTranslations("discountType");
  const tBox = useTranslations("boxStatus");
  const fmt = useFormatters();

  const carTypes = useCarTypes(carWashId);
  const services = useServices(carWashId);
  const packages = usePackages(carWashId);
  const servicePrices = useServicePrices(carWashId);
  const packagePrices = usePackagePrices(carWashId);
  const staff = useStaff(carWashId);
  const boxes = useBoxes(carWashId);
  const createOrder = useCreateOrder(carWashId);

  const schema = useMemo(
    () =>
      z
        .object({
          mode: z.enum(["walkin", "registered"]),
          carTypeId: z.string().min(1, t("selectCarType")),
          boxId: z.string().min(1, t("selectBox")),
          plate: z.string(),
          clientName: z.string(),
          clientPhone: z.string(),
          clientKind: z.enum(["regular", "corporate"]),
          brand: z.string(),
          model: z.string(),
          lines: z.array(
            z.object({ serviceId: z.string(), qty: z.number().int().min(1) }),
          ),
          packageId: z.string().nullable(),
          discountMajor: z.number().min(0),
          discountType: z.enum(DISCOUNT_TYPES),
          washerUserIds: z.array(z.string()),
        })
        .superRefine((v, ctx) => {
          if (!v.plate.trim()) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["plate"],
              message: tErrors("order.plate_required"),
            });
          }
          if (v.lines.length === 0 && !v.packageId) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["lines"],
              message: t("empty"),
            });
          }
        }),
    [t, tErrors],
  );
  type Values = z.infer<typeof schema>;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      mode: "walkin",
      carTypeId: "",
      boxId: "",
      plate: "",
      clientName: "",
      clientPhone: "",
      clientKind: "regular",
      brand: "",
      model: "",
      lines: [],
      packageId: null,
      discountMajor: 0,
      discountType: "manual",
      washerUserIds: [],
    },
  });

  const mode = form.watch("mode");
  const carTypeId = form.watch("carTypeId");
  const lines = form.watch("lines");
  const packageId = form.watch("packageId");
  const discountMajor = form.watch("discountMajor");
  const boxId = form.watch("boxId");
  const plate = form.watch("plate");

  const sPriceMap = useMemo(
    () => servicePriceMap(servicePrices.data ?? [], carTypeId || null),
    [servicePrices.data, carTypeId],
  );
  const pPriceMap = useMemo(
    () => packagePriceMap(packagePrices.data ?? [], carTypeId || null),
    [packagePrices.data, carTypeId],
  );
  const minorFactor = currency ? fmt.minorFactor(currency) : 100;
  const discountMinor = Math.round((discountMajor || 0) * minorFactor);

  const preview = useMemo(
    () =>
      computeOrderPreview({
        services: lines,
        packageId,
        servicePrices: sPriceMap,
        packagePrices: pPriceMap,
        discountMinor,
      }),
    [lines, packageId, sPriceMap, pPriceMap, discountMinor],
  );

  const availableServices = (services.data ?? []).filter((s) =>
    sPriceMap.has(s.id),
  );
  const availablePackages = (packages.data ?? []).filter((p) =>
    pPriceMap.has(p.id),
  );

  // When the car type changes, drop selections that this car type does not price.
  useEffect(() => {
    const next = form
      .getValues("lines")
      .filter((l) => sPriceMap.has(l.serviceId));
    if (next.length !== form.getValues("lines").length) {
      form.setValue("lines", next, {
        shouldValidate: form.formState.isSubmitted,
      });
    }
    const pkg = form.getValues("packageId");
    if (pkg && !pPriceMap.has(pkg)) {
      form.setValue("packageId", null, {
        shouldValidate: form.formState.isSubmitted,
      });
    }
  }, [sPriceMap, pPriceMap, form]);

  const [submitErrorCode, setSubmitErrorCode] = useState<string | null>(null);

  function toggleService(id: string) {
    const cur = form.getValues("lines");
    const next = cur.some((l) => l.serviceId === id)
      ? cur.filter((l) => l.serviceId !== id)
      : [...cur, { serviceId: id, qty: 1 }];
    form.setValue("lines", next, {
      shouldValidate: form.formState.isSubmitted,
    });
  }
  function setQty(id: string, qty: number) {
    form.setValue(
      "lines",
      form
        .getValues("lines")
        .map((l) => (l.serviceId === id ? { ...l, qty: Math.max(1, qty) } : l)),
      { shouldValidate: false },
    );
  }
  function toggleWasher(id: string) {
    const cur = form.getValues("washerUserIds");
    form.setValue(
      "washerUserIds",
      cur.includes(id) ? cur.filter((w) => w !== id) : [...cur, id],
    );
  }

  async function onSubmit(values: Values) {
    setSubmitErrorCode(null);
    const body: OrderCreate = {
      car_type_id: values.carTypeId,
      box_id: values.boxId,
      services: values.lines.map((l) => ({
        service_id: l.serviceId,
        qty: l.qty,
      })),
      package_id: values.packageId ?? null,
      washer_user_ids: values.washerUserIds,
      intake:
        values.mode === "registered"
          ? {
              plate: values.plate.trim(),
              client_name: values.clientName.trim() || null,
              client_phone: values.clientPhone.trim() || null,
              client_kind: values.clientKind,
              brand: values.brand.trim() || null,
              model: values.model.trim() || null,
            }
          : { plate: values.plate.trim(), client_kind: "walkin" },
    };
    if (values.discountMajor > 0) {
      body.discount = {
        amount_minor: discountMinor,
        type: values.discountType,
      };
    }
    try {
      await createOrder.mutateAsync(body);
      router.push("/board");
    } catch (error) {
      setSubmitErrorCode(extractErrorCode(error) ?? "unknown");
    }
  }

  if (!activeCarWash) {
    return <Notice text={tErrors("tenant.car_wash_required")} />;
  }
  if (!hasCapability("orders.create")) {
    return <Notice text={tErrors("auth.forbidden")} />;
  }

  const selectedBox = (boxes.data ?? []).find((b) => b.id === boxId);

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid gap-6 lg:grid-cols-[1fr_22rem]"
        noValidate
      >
        <div className="space-y-6">
          {/* Vehicle ----------------------------------------------------- */}
          <Card className="gap-5 p-5">
            <SectionTitle>{t("vehicle")}</SectionTitle>

            <Controller
              control={form.control}
              name="mode"
              render={({ field }) => (
                <Tabs
                  value={field.value}
                  onValueChange={(next) => {
                    if (next) field.onChange(next);
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="walkin">{t("walkIn")}</TabsTrigger>
                    <TabsTrigger value="registered">
                      {t("registered")}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            />

            {mode === "registered" ? (
              <ClientLookup
                carWashId={carWashId}
                onPick={(client) => {
                  form.setValue("clientName", client.name);
                  form.setValue("clientPhone", client.phone ?? "");
                  form.setValue(
                    "clientKind",
                    client.kind === "corporate" ? "corporate" : "regular",
                  );
                }}
              />
            ) : null}

            <PlateLookup
              carWashId={carWashId}
              onPick={(car) => {
                form.setValue("plate", car.plate, { shouldValidate: true });
                form.setValue("brand", car.brand ?? "");
                form.setValue("model", car.model ?? "");
                form.setValue("carTypeId", car.car_type_id, {
                  shouldValidate: true,
                });
              }}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="plate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("plate")}</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t("platePlaceholder")}
                        className="font-mono"
                        autoComplete="off"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="carTypeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("carType")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue placeholder={t("selectCarType")}>
                            {(value) =>
                              (carTypes.data ?? []).find((c) => c.id === value)
                                ?.name ?? t("selectCarType")
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(carTypes.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {mode === "registered" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="clientName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("clientName")}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientPhone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("clientPhone")}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          inputMode="tel"
                          className="font-mono"
                          autoComplete="off"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("brand")}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("model")}</FormLabel>
                      <FormControl>
                        <Input {...field} autoComplete="off" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="clientKind"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("clientType")}</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger className="h-9 w-full">
                            <SelectValue>
                              {(value) => tClientKind(value as string)}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {CLIENT_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {tClientKind(k)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>
            ) : null}
          </Card>

          {/* Services ---------------------------------------------------- */}
          <Card className="gap-4 p-5">
            <SectionTitle>{t("services")}</SectionTitle>
            {!carTypeId ? (
              <p className="text-muted-foreground text-sm">
                {t("selectCarTypeFirst")}
              </p>
            ) : availableServices.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("noServices")}</p>
            ) : (
              <ul className="grid gap-2">
                {availableServices.map((s) => {
                  const line = lines.find((l) => l.serviceId === s.id);
                  const unit = sPriceMap.get(s.id) ?? 0;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <Checkbox
                        checked={!!line}
                        onCheckedChange={() => toggleService(s.id)}
                        id={`svc-${s.id}`}
                      />
                      <Label
                        htmlFor={`svc-${s.id}`}
                        className="flex-1 cursor-pointer justify-between font-normal"
                      >
                        <span>{s.name}</span>
                        <span className="text-muted-foreground font-mono text-sm">
                          {fmt.money(unit, currency)}
                        </span>
                      </Label>
                      {line ? (
                        <Input
                          type="number"
                          min={1}
                          aria-label={t("qty")}
                          value={line.qty}
                          onChange={(e) =>
                            setQty(
                              s.id,
                              Number.parseInt(e.target.value, 10) || 1,
                            )
                          }
                          className="h-9 w-16 font-mono"
                        />
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {availablePackages.length > 0 ? (
              <FormField
                control={form.control}
                name="packageId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("package")}</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(next) =>
                        field.onChange(next === "none" ? null : next)
                      }
                    >
                      <FormControl>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue>
                            {(value) =>
                              value === "none" || value == null
                                ? t("noPackage")
                                : (availablePackages.find((p) => p.id === value)
                                    ?.name ?? t("noPackage"))
                            }
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("noPackage")}</SelectItem>
                        {availablePackages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name} ·{" "}
                            {fmt.money(pPriceMap.get(p.id) ?? 0, currency)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            ) : null}

            {form.formState.errors.lines ? (
              <p className="text-destructive text-sm">
                {form.formState.errors.lines.message}
              </p>
            ) : null}
          </Card>

          {/* Assignment -------------------------------------------------- */}
          <Card className="gap-5 p-5">
            <SectionTitle>{t("box")}</SectionTitle>
            <FormField
              control={form.control}
              name="boxId"
              render={({ field }) => (
                <FormItem>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="h-9 w-full">
                        <SelectValue placeholder={t("selectBox")}>
                          {(value) =>
                            (boxes.data ?? []).find((b) => b.id === value)
                              ?.name ?? t("selectBox")
                          }
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(boxes.data ?? []).map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} · {tBox(b.status)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {selectedBox?.status === "busy" ? (
              <p className="text-tone-amber-fg text-sm">{t("queuedNote")}</p>
            ) : null}

            <div className="space-y-2">
              <Label>{t("washers")}</Label>
              {(staff.data ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  {t("noWashers")}
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {(staff.data ?? []).map((member) => {
                    const checked = form
                      .watch("washerUserIds")
                      .includes(member.user_id);
                    return (
                      <li
                        key={member.user_id}
                        className="flex items-center gap-3 rounded-lg border p-3"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleWasher(member.user_id)}
                          id={`wsh-${member.user_id}`}
                        />
                        <Label
                          htmlFor={`wsh-${member.user_id}`}
                          className="flex-1 cursor-pointer font-normal"
                        >
                          {member.name ?? member.user_id.slice(0, 8)}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* Summary ------------------------------------------------------- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card className="gap-4 p-5">
            <SectionTitle>{t("summary")}</SectionTitle>

            {plate.trim() ? (
              <div className="flex justify-center py-1">
                <LicensePlate
                  plate={plate.trim()}
                  country={country}
                  size="md"
                />
              </div>
            ) : null}

            <div className="grid gap-3">
              <FormField
                control={form.control}
                name="discountMajor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("discountAmount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step="any"
                        className="font-mono"
                        value={Number.isFinite(field.value) ? field.value : 0}
                        onChange={(e) =>
                          field.onChange(Number.parseFloat(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="discountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("discountTypeLabel")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue>
                            {(value) => tDiscount(value as string)}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DISCOUNT_TYPES.map((d) => (
                          <SelectItem key={d} value={d}>
                            {tDiscount(d)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}
              />
            </div>

            <dl className="grid gap-2 border-t pt-4 text-sm">
              <Row label={t("subtotal")}>
                <span className="font-mono">
                  {fmt.money(preview.subtotalMinor, currency)}
                </span>
              </Row>
              <Row label={t("discount")}>
                <span className="font-mono">
                  −{fmt.money(preview.discountMinor, currency)}
                </span>
              </Row>
              <Row label={t("total")}>
                <span className="text-status-progress font-mono text-xl font-semibold">
                  {fmt.money(preview.totalMinor, currency)}
                </span>
              </Row>
            </dl>

            {submitErrorCode ? (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/5 text-destructive space-y-2 rounded-lg border p-3 text-sm"
              >
                <p>
                  {resolveErrorMessage(
                    toErrorTranslator(tErrors),
                    submitErrorCode,
                  )}
                </p>
                {submitErrorCode === "shift.not_open" ? (
                  <Link
                    href="/shift"
                    className={cn(
                      buttonVariants({ variant: "outline", size: "sm" }),
                      "h-9",
                    )}
                  >
                    {t("openShift")}
                  </Link>
                ) : null}
              </div>
            ) : null}

            <Button
              type="submit"
              className="min-h-11 w-full gap-2"
              disabled={createOrder.isPending}
            >
              {createOrder.isPending ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {createOrder.isPending ? t("submitting") : t("submit")}
            </Button>
          </Card>
        </div>
      </form>
    </Form>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-semibold tracking-tight">{children}</h2>;
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="bg-card flex items-center gap-2 rounded-2xl border p-5 text-sm shadow-sm">
      <TriangleAlert
        size={18}
        aria-hidden="true"
        className="text-destructive"
      />
      <p>{text}</p>
    </div>
  );
}

function ClientLookup({
  carWashId,
  onPick,
}: {
  carWashId: string | null;
  onPick: (client: {
    name: string;
    phone: string | null;
    kind: string;
  }) => void;
}) {
  const t = useTranslations("intake");
  const [term, setTerm] = useState("");
  const search = useClientSearch(carWashId, term);
  const results = term.trim() ? (search.data ?? []) : [];
  return (
    <div className="space-y-2">
      <Label htmlFor="client-search">{t("searchClient")}</Label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          id="client-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="pl-8"
          autoComplete="off"
        />
      </div>
      {results.length > 0 ? (
        <ul className="bg-card grid gap-1 rounded-lg border p-1">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(c);
                  setTerm("");
                }}
                className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <span>{c.name}</span>
                {c.phone ? (
                  <span className="text-muted-foreground font-mono text-xs">
                    {c.phone}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PlateLookup({
  carWashId,
  onPick,
}: {
  carWashId: string | null;
  onPick: (car: {
    plate: string;
    brand: string | null;
    model: string | null;
    car_type_id: string;
  }) => void;
}) {
  const t = useTranslations("intake");
  const [term, setTerm] = useState("");
  const search = useCarSearch(carWashId, term);
  const results = term.trim() ? (search.data ?? []) : [];
  return (
    <div className="space-y-2">
      <Label htmlFor="plate-search">{t("searchPlate")}</Label>
      <div className="relative">
        <Search
          size={16}
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-2.5 -translate-y-1/2"
        />
        <Input
          id="plate-search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t("platePlaceholder")}
          className="pl-8 font-mono"
          autoComplete="off"
        />
      </div>
      {results.length > 0 ? (
        <ul className="bg-card grid gap-1 rounded-lg border p-1">
          {results.map((car) => (
            <li key={car.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(car);
                  setTerm("");
                }}
                className="hover:bg-accent flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm"
              >
                <span className="font-mono">{car.plate}</span>
                <span className="text-muted-foreground text-xs">
                  {[car.brand, car.model].filter(Boolean).join(" ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
