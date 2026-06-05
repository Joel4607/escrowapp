import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useCallback } from "react";

type ReturnTransaction = Database["public"]["Tables"]["return_transactions"]["Row"];

export function useReturnTransaction(originalTransactionId: string | undefined) {
  const { data, isLoading, error, refetch } = useQuery<ReturnTransaction | null>({
    queryKey: ["return-transaction", originalTransactionId],
    queryFn: async () => {
      if (!originalTransactionId) return null;

      const { data: rows, error: queryError } = await supabase
        .from("return_transactions")
        .select("*")
        .eq("original_transaction_id", originalTransactionId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (queryError) throw queryError;
      return rows;
    },
    enabled: !!originalTransactionId,
  });

  const generateReturnToken = useCallback(
    async (returnTransactionId: string) => {
      const { data: token, error } = await supabase.rpc(
        "generate_return_delivery_token",
        { p_return_transaction_id: returnTransactionId },
      );
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const, token: token as string };
    },
    [originalTransactionId],
  );

  const confirmReturnDelivery = useCallback(
    async (returnTransactionId: string, token: string) => {
      const { error } = await supabase.rpc("confirm_return_delivery", {
        p_return_transaction_id: returnTransactionId,
        p_token: token,
      });
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const };
    },
    [originalTransactionId],
  );

  const approveReturn = useCallback(
    async (returnTransactionId: string) => {
      const { error } = await supabase.rpc("approve_return", {
        p_return_transaction_id: returnTransactionId,
      });
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const };
    },
    [originalTransactionId],
  );

  const raiseCounterDispute = useCallback(
    async (returnTransactionId: string, reason: string, description?: string) => {
      const { data: counterDisputeId, error } = await supabase.rpc(
        "raise_counter_dispute",
        {
          p_return_transaction_id: returnTransactionId,
          p_reason: reason,
          p_description: description,
        },
      );
      if (error) return { ok: false as const, error: error.message };
      queryClient.invalidateQueries({ queryKey: ["return-transaction", originalTransactionId] });
      return { ok: true as const, counterDisputeId: counterDisputeId as string };
    },
    [originalTransactionId],
  );

  return {
    returnTransaction: data ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    generateReturnToken,
    confirmReturnDelivery,
    approveReturn,
    raiseCounterDispute,
  };
}
