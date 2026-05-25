import { useAuth } from "@/features/auth/auth-context";
import type { Database } from "@/lib/database.types";
import { queryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

type LedgerRow = Database["public"]["Tables"]["escrow_ledger"]["Row"] & {
  transactions: { item_name: string; transaction_code: string } | null;
};

export function useEscrowLedger() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data: entries, isLoading, error, refetch } = useQuery<LedgerRow[]>({
    queryKey: ["escrow-ledger", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("escrow_ledger")
        .select("*, transactions(item_name, transaction_code)")
        .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as LedgerRow[]) ?? [];
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;

    const channelName = `ledger-${userId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "escrow_ledger",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["escrow-ledger", userId] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    entries: entries ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
