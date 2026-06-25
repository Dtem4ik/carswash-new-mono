import type { components } from "@carswash/shared";

/**
 * Pure helpers for the plate-first intake flow. The plate field plus the
 * car-by-plate lookup decide whether an order is "registered" (a named/phoned
 * customer to upsert) or a "walk-in" (plate only) — there is no mode toggle.
 * Framework-free so the autofill and walk-in paths are unit-tested directly.
 */

type IntakeIn = components["schemas"]["IntakeIn"];
type CarOut = components["schemas"]["CarOut"];
type ClientOut = components["schemas"]["ClientOut"];

/** The client kinds the intake form can set (a linked walk-in maps to regular). */
export type IntakeClientKind = "regular" | "corporate";

export interface IntakeDraft {
  plate: string;
  clientName: string;
  clientPhone: string;
  clientKind: IntakeClientKind;
  brand: string;
  model: string;
  /** True once a client is picked or the optional client section is filled. */
  hasClient: boolean;
}

/**
 * Build the `IntakeIn` payload from the form draft. With a client (name or
 * phone present) it is a registered intake the server upserts + links; otherwise
 * it is a plain walk-in needing only the plate.
 */
export function buildIntake(draft: IntakeDraft): IntakeIn {
  const plate = draft.plate.trim();
  const name = draft.clientName.trim();
  const phone = draft.clientPhone.trim();

  if (draft.hasClient && (name || phone)) {
    return {
      plate,
      client_kind: draft.clientKind,
      client_name: name || null,
      client_phone: phone || null,
      brand: draft.brand.trim() || null,
      model: draft.model.trim() || null,
    };
  }
  return { plate, client_kind: "walkin" };
}

export interface AutofillPatch {
  plate: string;
  carTypeId: string;
  brand: string;
  model: string;
  client: {
    id: string;
    name: string;
    phone: string;
    kind: IntakeClientKind;
  } | null;
}

/** Map a looked-up car (+ chosen linked client) into a form patch for autofill. */
export function autofillFromCar(
  car: CarOut,
  client: ClientOut | null,
): AutofillPatch {
  return {
    plate: car.plate,
    carTypeId: car.car_type_id,
    brand: car.brand ?? "",
    model: car.model ?? "",
    client: client
      ? {
          id: client.id,
          name: client.name,
          phone: client.phone ?? "",
          kind: client.kind === "corporate" ? "corporate" : "regular",
        }
      : null,
  };
}

/** Normalize a plate for comparison/lookup: trimmed, spaceless, uppercased. */
export function normalizePlate(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
