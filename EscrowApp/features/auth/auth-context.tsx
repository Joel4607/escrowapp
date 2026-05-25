import { supabase } from "@/lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { useRouter, useSegments } from "expo-router";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";

type AuthContextType = {
  session: Session | null;
  isLoading: boolean;
  isProfileComplete: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  isLoading: true,
  isProfileComplete: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  const checkProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id")
        .eq("id", userId)
        .single();
      return !!data;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        if (session?.user) {
          const hasProfile = await checkProfile(session.user.id);
          setIsProfileComplete(hasProfile);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        const hasProfile = await checkProfile(session.user.id);
        setIsProfileComplete(hasProfile);
      } else {
        setIsProfileComplete(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inInviteGroup = segments[0] === "invite";

    if (!session && !inAuthGroup && !inInviteGroup) {
      router.replace("/(auth)/welcome");
    } else if (session && !isProfileComplete && !inAuthGroup) {
      const email = session.user.email ?? "";
      router.replace({
        pathname: "/(auth)/create-password",
        params: { email },
      });
    } else if (session && isProfileComplete && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [session, isProfileComplete, segments, isLoading]);

  const refreshProfile = async () => {
    if (session?.user) {
      const hasProfile = await checkProfile(session.user.id);
      setIsProfileComplete(hasProfile);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setIsProfileComplete(false);
  };

  return (
    <AuthContext.Provider
      value={{ session, isLoading, isProfileComplete, signOut, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}
