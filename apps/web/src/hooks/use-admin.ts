"use client";

import type { components } from "@carswash/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Box } from "@/hooks/use-board-data";
import type {
  CarType,
  Package,
  PackagePrice,
  Service,
  ServicePrice,
} from "@/hooks/use-catalog";
import { useApiClient } from "@/lib/api-client";

// Re-export the row types so the admin sections import them from one place.
export type { Box, CarType, Package, Service };

/**
 * Admin (settings) data access: catalog + boxes reads that INCLUDE archived rows
 * (the order-intake hooks fetch active-only), plus every catalog/box/pricing
 * mutation. Reads are keyed under "admin" so they never collide with the
 * active-only caches the board and intake form rely on; mutations invalidate
 * both, so a change made in admin reflects everywhere immediately.
 */

export type CarTypeCreate = components["schemas"]["CarTypeCreate"];
export type CarTypeUpdate = components["schemas"]["CarTypeUpdate"];
export type ServiceCreate = components["schemas"]["ServiceCreate"];
export type ServiceUpdate = components["schemas"]["ServiceUpdate"];
export type PackageCreate = components["schemas"]["PackageCreate"];
export type PackageUpdate = components["schemas"]["PackageUpdate"];
export type BoxCreate = components["schemas"]["BoxCreate"];
export type BoxUpdate = components["schemas"]["BoxUpdate"];
export type ServicePriceUpsert = components["schemas"]["ServicePriceUpsert"];
export type PackagePriceUpsert = components["schemas"]["PackagePriceUpsert"];

/** Invalidate every cache a catalog/box/pricing write can affect. */
function useCatalogInvalidation(carWashId: string | null) {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [
      ["admin"],
      ["car-types", carWashId],
      ["services", carWashId],
      ["packages", carWashId],
      ["boxes", carWashId],
      ["service-prices", carWashId],
      ["package-prices", carWashId],
    ]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

// --- reads (include archived) -------------------------------------------------

export function useAdminCarTypes(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["admin", "car-types", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<CarType[]> => {
      const { data, error } = await client.GET("/car-types", {
        params: { query: { include_inactive: true } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminServices(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["admin", "services", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Service[]> => {
      const { data, error } = await client.GET("/services", {
        params: { query: { include_inactive: true } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminPackages(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["admin", "packages", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Package[]> => {
      const { data, error } = await client.GET("/packages", {
        params: { query: { include_inactive: true } },
      });
      if (error) throw error;
      return data;
    },
  });
}

export function useAdminBoxes(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: ["admin", "boxes", carWashId],
    enabled: carWashId != null,
    queryFn: async (): Promise<Box[]> => {
      const { data, error } = await client.GET("/boxes", {
        params: { query: { include_inactive: true } },
      });
      if (error) throw error;
      return data;
    },
  });
}

// --- car type mutations -------------------------------------------------------

export function useCarTypeMutations(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useCatalogInvalidation(carWashId);
  const create = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: CarTypeCreate) => {
      const { data, error } = await client.POST("/car-types", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: { id: string; body: CarTypeUpdate }) => {
      const { data, error } = await client.PATCH("/car-types/{car_type_id}", {
        params: { path: { car_type_id: vars.id } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/car-types/{car_type_id}/archive", {
        params: { path: { car_type_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/car-types/{car_type_id}/restore", {
        params: { path: { car_type_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, archive, restore };
}

// --- service mutations --------------------------------------------------------

export function useServiceMutations(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useCatalogInvalidation(carWashId);
  const create = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: ServiceCreate) => {
      const { data, error } = await client.POST("/services", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: { id: string; body: ServiceUpdate }) => {
      const { data, error } = await client.PATCH("/services/{service_id}", {
        params: { path: { service_id: vars.id } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/services/{service_id}/archive", {
        params: { path: { service_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/services/{service_id}/restore", {
        params: { path: { service_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, archive, restore };
}

// --- package mutations --------------------------------------------------------

export function usePackageMutations(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useCatalogInvalidation(carWashId);
  const create = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: PackageCreate) => {
      const { data, error } = await client.POST("/packages", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: { id: string; body: PackageUpdate }) => {
      const { data, error } = await client.PATCH("/packages/{package_id}", {
        params: { path: { package_id: vars.id } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const setServices = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: { id: string; serviceIds: string[] }) => {
      const { data, error } = await client.PUT(
        "/packages/{package_id}/services",
        {
          params: { path: { package_id: vars.id } },
          body: { service_ids: vars.serviceIds },
        },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/packages/{package_id}/archive", {
        params: { path: { package_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/packages/{package_id}/restore", {
        params: { path: { package_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, setServices, archive, restore };
}

// --- box mutations ------------------------------------------------------------

export function useBoxMutations(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const invalidate = useCatalogInvalidation(carWashId);
  const create = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: BoxCreate) => {
      const { data, error } = await client.POST("/boxes", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const update = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: { id: string; body: BoxUpdate }) => {
      const { data, error } = await client.PATCH("/boxes/{box_id}", {
        params: { path: { box_id: vars.id } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
  const archive = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/boxes/{box_id}/archive", {
        params: { path: { box_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.POST("/boxes/{box_id}/restore", {
        params: { path: { box_id: id } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
  return { create, update, archive, restore };
}

// --- price upserts ------------------------------------------------------------

export function useServicePriceUpsert(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: ServicePriceUpsert): Promise<ServicePrice> => {
      const { data, error } = await client.PUT("/service-prices", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["service-prices", carWashId],
      });
    },
  });
}

export function usePackagePriceUpsert(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();
  return useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: PackagePriceUpsert): Promise<PackagePrice> => {
      const { data, error } = await client.PUT("/package-prices", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["package-prices", carWashId],
      });
    },
  });
}
