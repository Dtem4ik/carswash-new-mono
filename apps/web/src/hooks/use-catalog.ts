"use client";

import type { components } from "@carswash/shared";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

/**
 * Read hooks for the catalog + pricing matrix the order-intake form consumes.
 * All are tenant-scoped through `useApiClient` (X-Car-Wash-Id) and cached by
 * TanStack Query keyed on the active car wash.
 */

export type CarType = components["schemas"]["CarTypeOut"];
export type Service = components["schemas"]["ServiceOut"];
export type Package = components["schemas"]["PackageOut"];
export type ServicePrice = components["schemas"]["ServicePriceOut"];
export type PackagePrice = components["schemas"]["PackagePriceOut"];
export type Staff = components["schemas"]["StaffOut"];
export type Client = components["schemas"]["ClientOut"];
export type Car = components["schemas"]["CarOut"];

export function useCarTypes(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["car-types", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<CarType[]> => {
      const { data, error } = await client.GET("/car-types", {});
      if (error) throw error;
      return data;
    },
  });
}

export function useServices(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["services", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await client.GET("/services", {});
      if (error) throw error;
      return data;
    },
  });
}

export function usePackages(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["packages", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Package[]> => {
      const { data, error } = await client.GET("/packages", {});
      if (error) throw error;
      return data;
    },
  });
}

export function useServicePrices(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["service-prices", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<ServicePrice[]> => {
      const { data, error } = await client.GET("/service-prices", {});
      if (error) throw error;
      return data;
    },
  });
}

export function usePackagePrices(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["package-prices", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<PackagePrice[]> => {
      const { data, error } = await client.GET("/package-prices", {});
      if (error) throw error;
      return data;
    },
  });
}

export function useStaff(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["staff", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Staff[]> => {
      const { data, error } = await client.GET("/staff", {});
      if (error) throw error;
      return data;
    },
  });
}

/** Client search by name/phone; runs only once the term is non-empty. */
export function useClientSearch(carWashId: string | null, term: string) {
  const client = useApiClient(carWashId);
  const q = term.trim();
  return useQuery({
    queryKey: ["clients", carWashId, q],
    enabled: carWashId != null && q.length > 0,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await client.GET("/clients", {
        params: { query: { q } },
      });
      if (error) throw error;
      return data;
    },
  });
}

/** Car search by (partial) plate; runs only once the term is non-empty. */
export function useCarSearch(carWashId: string | null, plate: string) {
  const client = useApiClient(carWashId);
  const q = plate.trim();
  return useQuery({
    queryKey: ["cars", carWashId, q],
    enabled: carWashId != null && q.length > 0,
    queryFn: async (): Promise<Car[]> => {
      const { data, error } = await client.GET("/cars", {
        params: { query: { plate: q } },
      });
      if (error) throw error;
      return data;
    },
  });
}
