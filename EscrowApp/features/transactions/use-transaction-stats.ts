import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

type TransactionStats = {
  completed: number;
  disputed: number;
  total: number;
};

export function useTransactionStats() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data, isLoading } = useQuery<TransactionStats>({
    queryKey: ["transaction-stats", userId],
    queryFn: async () => {
      if (!userId) return { completed: 0, disputed: 0, total: 0 };

      const { data: rows, error } = await supabase
        .from("transactions")
        .select("status")
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

      if (error) throw error;

      const statuses = (rows ?? []).map((r) => r.status);

      return {
        completed: statuses.filter((s) => s === "released").length,
        disputed: statuses.filter(
          (s) => s === "disputed" || s === "admin_review",
        ).length,
        total: statuses.length,
      };
    },
    enabled: !!userId,
  });

  return {
    stats: data ?? { completed: 0, disputed: 0, total: 0 },
    isLoading,
  };
}
