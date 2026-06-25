import type { components } from "@carswash/shared";
import { describe, expect, it } from "vitest";
import {
  autofillFromCar,
  buildIntake,
  type IntakeDraft,
  normalizePlate,
} from "./intake";

type CarOut = components["schemas"]["CarOut"];
type ClientOut = components["schemas"]["ClientOut"];

const baseDraft: IntakeDraft = {
  plate: "777 ABC 01",
  clientName: "",
  clientPhone: "",
  clientKind: "regular",
  brand: "",
  model: "",
  hasClient: false,
};

describe("buildIntake — walk-in minimal path", () => {
  it("with no client sends only the plate as a walk-in", () => {
    expect(buildIntake(baseDraft)).toEqual({
      plate: "777 ABC 01",
      client_kind: "walkin",
    });
  });

  it("stays a walk-in even if the client section was opened but left blank", () => {
    expect(buildIntake({ ...baseDraft, hasClient: true })).toEqual({
      plate: "777 ABC 01",
      client_kind: "walkin",
    });
  });

  it("trims the plate", () => {
    expect(buildIntake({ ...baseDraft, plate: "  ABC 1 " }).plate).toBe(
      "ABC 1",
    );
  });
});

describe("buildIntake — registered path", () => {
  it("includes client + vehicle details when a client is present", () => {
    expect(
      buildIntake({
        plate: "777 ABC 01",
        clientName: "Acme Taxi",
        clientPhone: "+7 700 000 0000",
        clientKind: "corporate",
        brand: "Toyota",
        model: "Camry",
        hasClient: true,
      }),
    ).toEqual({
      plate: "777 ABC 01",
      client_kind: "corporate",
      client_name: "Acme Taxi",
      client_phone: "+7 700 000 0000",
      brand: "Toyota",
      model: "Camry",
    });
  });

  it("sends a phone-only client (no name) with null name", () => {
    const intake = buildIntake({
      ...baseDraft,
      clientPhone: "12345",
      hasClient: true,
    });
    expect(intake.client_name).toBeNull();
    expect(intake.client_phone).toBe("12345");
    expect(intake.client_kind).toBe("regular");
  });

  it("nulls blank brand/model rather than sending empty strings", () => {
    const intake = buildIntake({
      ...baseDraft,
      clientName: "Bob",
      hasClient: true,
    });
    expect(intake.brand).toBeNull();
    expect(intake.model).toBeNull();
  });
});

describe("autofillFromCar", () => {
  const car: CarOut = {
    id: "car-1",
    plate: "777 ABC 01",
    car_type_id: "ct-1",
    brand: "Toyota",
    model: "Camry",
    clients: [],
  };

  it("maps the car fields and the chosen client", () => {
    const client: ClientOut = {
      id: "cl-1",
      name: "Acme Taxi",
      phone: "+7 700",
      kind: "corporate",
    };
    expect(autofillFromCar(car, client)).toEqual({
      plate: "777 ABC 01",
      carTypeId: "ct-1",
      brand: "Toyota",
      model: "Camry",
      client: {
        id: "cl-1",
        name: "Acme Taxi",
        phone: "+7 700",
        kind: "corporate",
      },
    });
  });

  it("maps a walk-in-kind linked client to the regular form kind", () => {
    const client: ClientOut = {
      id: "cl-2",
      name: "Walk",
      phone: null,
      kind: "walkin",
    };
    const patch = autofillFromCar(car, client);
    expect(patch.client?.kind).toBe("regular");
    expect(patch.client?.phone).toBe("");
  });

  it("yields a null client when the car has none linked", () => {
    expect(autofillFromCar(car, null).client).toBeNull();
  });

  it("tolerates null brand/model as empty strings", () => {
    const patch = autofillFromCar({ ...car, brand: null, model: null }, null);
    expect(patch.brand).toBe("");
    expect(patch.model).toBe("");
  });
});

describe("normalizePlate", () => {
  it("strips whitespace and uppercases", () => {
    expect(normalizePlate(" 777 abc 01 ")).toBe("777ABC01");
  });
});
