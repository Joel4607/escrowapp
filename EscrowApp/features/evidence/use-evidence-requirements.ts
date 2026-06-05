import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useQuery } from "@tanstack/react-query";

type EvidenceRequirement = Database["public"]["Tables"]["evidence_requirements"]["Row"];

export function useEvidenceRequirements(phase: string | undefined) {
  const { data, isLoading } = useQuery<EvidenceRequirement[]>({
    queryKey: ["evidence-requirements", phase],
    queryFn: async () => {
      if (!phase) return [];
      const { data: rows, error } = await supabase
        .from("evidence_requirements")
        .select("*")
        .eq("phase", phase)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return rows ?? [];
    },
    enabled: !!phase,
    staleTime: 1000 * 60 * 30,
  });

  return {
    requirements: data ?? [],
    isLoading,
    requiredCategories: (data ?? []).filter((r) => r.is_required).map((r) => r.category),
    optionalCategories: (data ?? []).filter((r) => !r.is_required).map((r) => r.category),
  };
}
