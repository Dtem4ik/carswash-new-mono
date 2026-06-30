"use client";

import type { components } from "@carswash/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";

/**
 * Staff & roles data access (Admin → Staff). Reads the org / active car wash
 * members; invites by email (returns a one-time temporary password for a brand
 * new account), changes a member's role/scope, and removes a membership. The
 * invite and role dialogs show their errors inline (`meta.errorMode: "inline"`);
 * removal failures surface through the global error modal.
 */

export type Member = components["schemas"]["MemberOut"];
export type MemberInvite = components["schemas"]["MemberInvite"];
export type MemberInviteResult = components["schemas"]["MemberInviteOut"];
export type MemberRoleUpdate = components["schemas"]["MemberRoleUpdate"];

const membersKey = (carWashId: string | null) => ["members", carWashId];

export function useMembers(carWashId: string | null) {
  const client = useApiClient(carWashId);
  return useQuery({
    queryKey: membersKey(carWashId),
    enabled: carWashId != null,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await client.GET("/members", {});
      if (error) throw error;
      return data;
    },
  });
}

export function useMemberMutations(carWashId: string | null) {
  const client = useApiClient(carWashId);
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: membersKey(carWashId) });

  const invite = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (body: MemberInvite): Promise<MemberInviteResult> => {
      const { data, error } = await client.POST("/members", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const updateRole = useMutation({
    meta: { errorMode: "inline" },
    mutationFn: async (vars: {
      membershipId: string;
      body: MemberRoleUpdate;
    }): Promise<Member> => {
      const { data, error } = await client.PATCH("/members/{membership_id}", {
        params: { path: { membership_id: vars.membershipId } },
        body: vars.body,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (membershipId: string) => {
      const { error } = await client.DELETE("/members/{membership_id}", {
        params: { path: { membership_id: membershipId } },
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { invite, updateRole, remove };
}
