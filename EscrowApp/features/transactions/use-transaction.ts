import type { Database } from "@/lib/database.types";
import { queryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

export function useTransaction(transactionId: string | undefined) {
  const { data: transaction, isLoading, error, refetch } = useQuery<Transaction | null>({
    queryKey: ["transaction", transactionId],
    queryFn: async () => {
      if (!transactionId) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", transactionId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!transactionId,
  });

  useEffect(() => {
    if (!transactionId) return;

    const channelName = `tx-${transactionId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `id=eq.${transactionId}`,
        },
        (payload) => {
          queryClient.setQueryData(
            ["transaction", transactionId],
            payload.new as Transaction,
          );
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [transactionId]);

  return {
    transaction: transaction ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
