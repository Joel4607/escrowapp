import { useAuth } from "@/features/auth/auth-context";
import type { Database } from "@/lib/database.types";
import { queryClient } from "@/lib/query-client";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";

type UserProfile = Database["public"]["Tables"]["users"]["Row"];

export function useUserProfile() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const { data: profile, isLoading, error, refetch } = useQuery<UserProfile | null>({
    queryKey: ["profile", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

  useEffect(() => {
    if (!userId) return;

    const channelName = `profile-${userId}`;

    // Remove any stale channel with the same name (React Strict Mode double-mount)
    const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
    if (existing) supabase.removeChannel(existing);

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "users",
          filter: `id=eq.${userId}`,
        },
        (payload) => {
          queryClient.setQueryData(["profile", userId], payload.new as UserProfile);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return {
    profile: profile ?? null,
    isLoading,
    error: error ? (error as Error).message : null,
    refetch,
  };
}
