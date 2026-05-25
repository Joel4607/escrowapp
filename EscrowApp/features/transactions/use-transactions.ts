import { useAuth } from "@/features/auth/auth-context";
import type { Database, TransactionStatus } from "@/lib/database.types";
import { queryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";
import {
  canArchiveTransactionForUser,
  canDeleteTransaction,
  canDeleteTransactionForUser,
} from "@/features/transactions/visibility-rules";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

type Transaction = Database["public"]["Tables"]["transactions"]["Row"];

const ACTIVE_STATUSES: TransactionStatus[] = [
  "created",
  "seller_invited",
  "accepted",
  "funded",
  "in_delivery",
  "delivered",
  "under_inspection",
];

const COMPLETED_STATUSES: TransactionStatus[] = [
  "released",
  "refunded",
  "partially_refunded",
];

const DISPUTED_STATUSES: TransactionStatus[] = ["disputed", "admin_review"];

const CANCELLED_STATUSES: TransactionStatus[] = ["cancelled", "rejected"];

const EXPIRED_STATUSES: TransactionStatus[] = ["expired"];

export type StatusFilter =
  | "all"
  | "active"
  | "completed"
  | "disputed"
  | "cancelled"
  | "expired";

function getStatusesForFilter(filter: StatusFilter): TransactionStatus[] | null {
  switch (filter) {
    case "active":
      return ACTIVE_STATUSES;
    case "completed":
      return COMPLETED_STATUSES;
    case "disputed":
      return DISPUTED_STATUSES;
    case "cancelled":
      return CANCELLED_STATUSES;
    case "expired":
      return EXPIRED_STATUSES;
    default:
      return null;
  }
}

export {
  canArchiveTransactionForUser,
  canDeleteTransaction,
  canDeleteTransactionForUser,
};

export function useTransactions(
  filter: StatusFilter = "all",
  limit?: number,
) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data: transactions, isLoading, error, refetch } = useQuery<Transaction[]>({
    queryKey: ["transactions", userId, filter, limit],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from("transactions")
        .select("*")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
        .order("created_at", { ascending: false });

      const statuses = getStatusesForFilter(filter);
      if (statuses) {
        query = query.in("status", statuses);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error: queryError } = await query;
      if (queryError) throw queryError;

      const { data: archivedRows, error: archiveError } = await supabase
        .from("transaction_archives")
        .select("transaction_id")
        .eq("user_id", userId);

      if (archiveError) throw archiveError;

      const archivedIds = new Set(
        (archivedRows ?? []).map((row) => row.transaction_id),
      );

      return (data ?? []).filter((tx) => !archivedIds.has(tx.id));
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;

    const channelName = `tx-list-${userId}`;
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as Transaction | undefined;
          if (row && (row.buyer_id === userId || row.seller_id === userId)) {
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    if (!userId) {
      return { ok: false, error: "You must be signed in to delete a transaction." };
    }

    const tx = (transactions ?? []).find((t) => t.id === transactionId);
    if (!tx) {
      return { ok: false, error: "Transaction not found in the current list." };
    }

    if (tx.buyer_id !== userId) {
      return { ok: false, error: "Only the buyer who created this transaction can delete it." };
    }

    if (!canDeleteTransaction(tx.status)) {
      return { ok: false, error: "Transactions with active locked funds cannot be deleted." };
    }

    const { error: delError } = await supabase.rpc("delete_transaction", {
      p_transaction_id: transactionId,
    });

    if (delError) {
      return { ok: false, error: delError.message };
    }

    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    return { ok: true };
  }, [userId, transactions]);

  const archiveTransaction = useCallback(async (transactionId: string) => {
    if (!userId) {
      return { ok: false, error: "You must be signed in to hide a transaction." };
    }

    const tx = (transactions ?? []).find((t) => t.id === transactionId);
    if (!tx) {
      return { ok: false, error: "Transaction not found in the current list." };
    }

    if (!canArchiveTransactionForUser(tx, userId)) {
      return {
        ok: false,
        error: "Only the seller can hide settled transactions from their own list.",
      };
    }

    const { error: archiveError } = await supabase
      .from("transaction_archives")
      .upsert(
        { transaction_id: transactionId, user_id: userId },
        { onConflict: "transaction_id,user_id" },
      );

    if (archiveError) {
      return { ok: false, error: archiveError.message };
    }

    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    return { ok: true };
  }, [userId, transactions]);

  return {
    transactions: transactions ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    deleteTransaction,
    archiveTransaction,
  };
}
