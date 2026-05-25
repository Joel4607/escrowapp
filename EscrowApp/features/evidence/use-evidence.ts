import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { useCallback } from "react";

type Evidence = Database["public"]["Tables"]["evidence"]["Row"];

export type EvidenceType =
  | "item_photo"
  | "pre_delivery"
  | "received_item"
  | "dispute_evidence"
  | "delivery_proof"
  | "unboxing";

export function useEvidence(transactionId: string | undefined) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data, isLoading, error, refetch } = useQuery<Evidence[]>({
    queryKey: ["evidence", transactionId],
    queryFn: async () => {
      if (!transactionId) return [];

      const { data: rows, error: queryError } = await supabase
        .from("evidence")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: true });

      if (queryError) throw queryError;
      return rows ?? [];
    },
    enabled: !!transactionId && !!userId,
  });

  const getSignedUrl = useCallback(
    async (path: string): Promise<string | null> => {
      const { data: urlData, error: urlError } = await supabase.storage
        .from("evidence")
        .createSignedUrl(path, 3600); // 1 hour

      if (urlError) return null;
      return urlData.signedUrl;
    },
    [],
  );

  const uploadEvidence = useCallback(
    async ({
      imageUri,
      evidenceType,
      notes,
    }: {
      imageUri: string;
      evidenceType: EvidenceType;
      notes?: string;
    }): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!userId || !transactionId) {
        return { ok: false, error: "Not authenticated or no transaction" };
      }

      try {
        // Get the file extension from URI
        const ext = imageUri.split(".").pop()?.toLowerCase() ?? "jpg";
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const storagePath = `${userId}/${transactionId}/${fileName}`;

        // Read file as blob for upload
        const response = await fetch(imageUri);
        const blob = await response.blob();

        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from("evidence")
          .upload(storagePath, blob, {
            contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
            upsert: false,
          });

        if (uploadError) {
          return { ok: false, error: uploadError.message };
        }

        // Get the user's role in this transaction
        const { data: tx } = await supabase
          .from("transactions")
          .select("buyer_id, seller_id")
          .eq("id", transactionId)
          .single();

        const userRole =
          tx?.buyer_id === userId
            ? "buyer"
            : tx?.seller_id === userId
            ? "seller"
            : "buyer";

        // Insert evidence record
        const { error: insertError } = await supabase.from("evidence").insert({
          transaction_id: transactionId,
          uploaded_by: userId,
          user_role: userRole as "buyer" | "seller" | "admin",
          evidence_type: evidenceType,
          image_url: storagePath,
          notes: notes ?? null,
          timestamp: new Date().toISOString(),
        });

        if (insertError) {
          return { ok: false, error: insertError.message };
        }

        // Invalidate cache
        queryClient.invalidateQueries({
          queryKey: ["evidence", transactionId],
        });

        return { ok: true };
      } catch (e) {
        return {
          ok: false,
          error: e instanceof Error ? e.message : "Upload failed",
        };
      }
    },
    [userId, transactionId],
  );

  return {
    evidence: data ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
    uploadEvidence,
    getSignedUrl,
  };
}
