"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil, TriangleAlert, UserPlus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { LicensePlate } from "@/components/license-plate";
import { Button } from "@/components/ui/button";
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
import { useBoxes } from "@/hooks/use-board-data";
import {
  type Car,
  type Client,
  useCarSearch,
  useCarTypes,
  usePackagePrices,
  usePackages,
  useServicePrices,
  useServices,
  useStaff,
} from "@/hooks/use-catalog";
import { type OrderCreate, useCreateOrder } from "@/hooks/use-orders";
import { useFormatters } from "@/lib/format";
import { autofillFromCar, buildIntake, normalizePlate } from "@/lib/intake";
import { newOptimisticId } from "@/lib/order-cache";
import {
  computeOrderPreview,
  packagePriceMap,
  servicePriceMap,
} from "@/lib/pricing";
import { useTenant } from "@/lib/tenant-context";

const CLIENT_KINDS = ["regular", "corporate"] as const;
const DISCOUNT_TYPES = ["manual", "loyalty", "promo", "subscription"] as const;

/** A car picked from the plate lookup, plus the chosen linked client (if any). */
interface PickedVehicle {
  car: Car;
  client: Client | null;
}

/**
 * Plate-first order intake: one smart plate field drives a debounced lookup.
 * A match autofills the returning customer and car type (straight to services);
 * a new plate is a walk-in needing only a car type, with client details
 * optional and progressive. The box can be preselected via ?box from the board.
 */
export function OrderIntakeForm() {
  const { activeCarWash, hasCapability } = useTenant();
  const carWashId = activeCarWash?.id ?? null;
  const currency = activeCarWash?.currency ?? "";
  const country = activeCarWash?.country ?? null;

  const router = useRouter();
  const searchParams = useSearchParams();
  const boxParam = searchParams.get("box");

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

  const carTypeId = form.watch("carTypeId");
  const lines = form.watch("lines");
  const packageId = form.watch("packageId");
  const discountMajor = form.watch("discountMajor");
  const boxId = form.watch("boxId");
  const plate = form.watch("plate");

  // Plate-first lookup: debounce the plate into a lookup term.
  const [lookupTerm, setLookupTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setLookupTerm(plate.trim()), 250);
    return () => clearTimeout(id);
  }, [plate]);
  const carSearch = useCarSearch(carWashId, lookupTerm);
  const matches = lookupTerm ? (carSearch.data ?? []) : [];

  const [picked, setPicked] = useState<PickedVehicle | null>(null);
  const [showClient, setShowClient] = useState(false);

  // Editing the plate away from the picked car drops the recognized state.
  useEffect(() => {
    if (picked && normalizePlate(plate) !== normalizePlate(picked.car.plate)) {
      setPicked(null);
    }
  }, [plate, picked]);

  // Preselect the box from ?box once the boxes load; lock the picker until the
  // operator chooses to change it. A generic intake (no ?box) shows the picker.
  const [boxLocked, setBoxLocked] = useState(false);
  useEffect(() => {
    if (!boxParam || boxId) return;
    const match = (boxes.data ?? []).find((b) => b.id === boxParam);
    if (match) {
      form.setValue("boxId", match.id, { shouldValidate: true });
      setBoxLocked(true);
    }
  }, [boxParam, boxes.data, boxId, form]);

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

  function applyClient(client: Client | null) {
    if (client) {
      form.setValue("clientName", client.name);
      form.setValue("clientPhone", client.phone ?? "");
      form.setValue(
        "clientKind",
        client.kind === "corporate" ? "corporate" : "regular",
      );
    } else {
      form.setValue("clientName", "");
      form.setValue("clientPhone", "");
      form.setValue("clientKind", "regular");
    }
  }

  function pickCar(car: Car) {
    const client = car.clients[0] ?? null;
    const patch = autofillFromCar(car, client);
    form.setValue("plate", patch.plate, { shouldValidate: true });
    form.setValue("carTypeId", patch.carTypeId, { shouldValidate: true });
    form.setValue("brand", patch.brand);
    form.setValue("model", patch.model);
    applyClient(client);
    setPicked({ car, client });
    setShowClient(false);
  }

  function chooseLinkedClient(clientId: string | null) {
    if (!picked || !clientId) return;
    const client = picked.car.clients.find((c) => c.id === clientId) ?? null;
    applyClient(client);
    setPicked({ car: picked.car, client });
  }

  function changeVehicle() {
    setPicked(null);
    applyClient(null);
    form.setValue("brand", "");
    form.setValue("model", "");
    form.setValue("plate", "", { shouldValidate: false });
  }

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

  function onSubmit(values: Values) {
    const hasClient = picked ? picked.client != null : showClient;
    const body: OrderCreate = {
      car_type_id: values.carTypeId,
      box_id: values.boxId,
      services: values.lines.map((l) => ({
        service_id: l.serviceId,
        qty: l.qty,
      })),
      package_id: values.packageId ?? null,
      washer_user_ids: values.washerUserIds,
      intake: buildIntake({
        plate: values.plate,
        clientName: values.clientName,
        clientPhone: values.clientPhone,
        clientKind: values.clientKind,
        brand: values.brand,
        model: values.model,
        hasClient,
      }),
    };
    if (values.discountMajor > 0) {
      body.discount = {
        amount_minor: discountMinor,
        type: values.discountType,
      };
    }

    // Reflect the new order on the board the instant it is submitted, then
    // navigate. The global mutation cache reconciles with the server response
    // (swapping this temp row for the real one) and rolls back + toasts on
    // error (see lib/query-client.ts) — even though this form has unmounted.
    const targetBox = (boxes.data ?? []).find((b) => b.id === values.boxId);
    const washerNames = new Map(
      (staff.data ?? []).map((s) => [s.user_id, s.name ?? null]),
    );
    createOrder.mutate({
      body,
      optimistic: {
        id: newOptimisticId(),
        boxId: values.boxId,
        carWashId: carWashId ?? "",
        carTypeId: values.carTypeId,
        plate: values.plate.trim() || null,
        clientName: hasClient ? values.clientName.trim() || null : null,
        clientPhone: hasClient ? values.clientPhone.trim() || null : null,
        totalMinor: preview.totalMinor,
        subtotalMinor: preview.subtotalMinor,
        discountMinor: preview.discountMinor,
        currency,
        boxFree: targetBox?.status === "free",
        corporate: hasClient && values.clientKind === "corporate",
        washers: values.washerUserIds.map((id) => ({
          user_id: id,
          name: washerNames.get(id) ?? null,
        })),
        nowIso: new Date().toISOString(),
      },
    });
    router.push("/board");
  }

  if (!activeCarWash) {
    return <Notice text={tErrors("tenant.car_wash_required")} />;
  }
  if (!hasCapability("orders.create")) {
    return <Notice text={tErrors("auth.forbidden")} />;
  }

  const selectedBox = (boxes.data ?? []).find((b) => b.id === boxId);
  const pickedCarTypeName = (carTypes.data ?? []).find(
    (c) => c.id === carTypeId,
  )?.name;

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

            {picked ? (
              <div className="space-y-4 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="bg-tone-green-bg text-tone-green-fg inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                      {t("returningCustomer")}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-9"
                    onClick={changeVehicle}
                  >
                    <Pencil />
                    {t("changeVehicle")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <LicensePlate
                    plate={picked.car.plate}
                    country={country}
                    size="md"
                  />
                  {pickedCarTypeName ? (
                    <span className="text-muted-foreground text-sm">
                      {pickedCarTypeName}
                    </span>
                  ) : null}
                </div>

                {picked.car.clients.length > 1 ? (
                  <div className="grid gap-2">
                    <Label htmlFor="linked-client">{t("customer")}</Label>
                    <Select
                      value={picked.client?.id ?? ""}
                      onValueChange={chooseLinkedClient}
                    >
                      <SelectTrigger id="linked-client" className="h-9 w-full">
                        <SelectValue>
                          {(value) =>
                            picked.car.clients.find((c) => c.id === value)
                              ?.name ?? t("customer")
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {picked.car.clients.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                            {c.phone ? ` · ${c.phone}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : picked.client ? (
                  <p className="text-sm">
                    <span className="font-medium">{picked.client.name}</span>
                    {picked.client.phone ? (
                      <span className="text-muted-foreground font-mono">
                        {" "}
                        · {picked.client.phone}
                      </span>
                    ) : null}
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    {t("noLinkedClient")}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
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
                          className="h-12 font-mono text-lg"
                          autoComplete="off"
                        />
                      </FormControl>
                      <p className="text-muted-foreground text-xs">
                        {carSearch.isFetching && lookupTerm
                          ? t("searching")
                          : t("plateFirstHint")}
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {matches.length > 0 ? (
                  <div className="space-y-1.5">
                    <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      {t("matchingVehicles")}
                    </p>
                    <ul className="bg-card grid gap-1 rounded-lg border p-1">
                      {matches.map((car) => (
                        <li key={car.id}>
                          <button
                            type="button"
                            onClick={() => pickCar(car)}
                            className="hover:bg-accent flex w-full items-center gap-3 rounded-md px-2 py-2 text-left"
                          >
                            <LicensePlate
                              plate={car.plate}
                              country={country}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1 text-sm">
                              {car.clients[0] ? (
                                <span className="font-medium">
                                  {car.clients[0].name}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  {[car.brand, car.model]
                                    .filter(Boolean)
                                    .join(" ") || t("noLinkedClient")}
                                </span>
                              )}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : plate.trim() ? (
                  <p className="text-muted-foreground text-sm">
                    {t("newVehicle")}
                  </p>
                ) : null}
              </div>
            )}

            {/* Car type: read-only chip when recognized, picker otherwise. */}
            {picked ? null : (
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
            )}

            {/* Optional, progressive client details for a new vehicle. */}
            {!picked ? (
              showClient ? (
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {t("clientType")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-9"
                      onClick={() => {
                        setShowClient(false);
                        applyClient(null);
                      }}
                    >
                      <X />
                      {t("changeVehicle")}
                    </Button>
                  </div>
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
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 w-full sm:w-auto"
                  onClick={() => setShowClient(true)}
                >
                  <UserPlus />
                  {t("addClient")}
                </Button>
              )
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
            {boxLocked && selectedBox ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{selectedBox.name}</span>
                  <span className="bg-tone-blue-bg text-tone-blue-fg inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
                    {t("boxFromBoard")}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-9"
                  onClick={() => setBoxLocked(false)}
                >
                  <Pencil />
                  {t("changeBox")}
                </Button>
              </div>
            ) : (
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
            )}
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
