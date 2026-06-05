import { useAuth } from "@/features/auth/auth-context";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForPushNotifications(): Promise<string | null> {
  // Check permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("Push notification permission denied");
    return null;
  }

  // Get the projectId from app config
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.error("Missing EAS projectId in app.json extra.eas.projectId");
    return null;
  }

  // Get the Expo push token
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data; // "ExponentPushToken[xxx]"
}

async function savePushToken(userId: string, token: string): Promise<void> {
  try {
    const platform = Platform.OS;
    const { error } = await supabase.from("push_tokens").upsert(
      {
        user_id: userId,
        token,
        platform,
      },
      { onConflict: "user_id,token" }
    );
    if (error) {
      // Non-critical — push tokens are optional for prototype
    }
  } catch {
    // Network failure — silently ignore
  }
}

export function useNotifications() {
  const { session } = useAuth();
  const router = useRouter();
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);

  // Register push token when user is logged in (mobile only)
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!session?.user?.id) return;

    registerForPushNotifications()
      .then((token) => {
        if (token) {
          savePushToken(session.user.id, token);
        }
      })
      .catch(() => {
        // Push notifications aren't available in Expo Go (SDK 53+).
        // Use a development build for full notification support.
      });
  }, [session?.user?.id]);

  // Handle notification taps — navigate to the transaction (mobile only)
  useEffect(() => {
    if (Platform.OS === "web") return;

    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const transactionId = data?.transactionId as string | undefined;

        if (transactionId) {
          router.push({
            pathname: "/transaction/[id]",
            params: { id: transactionId },
          });
        }
      });

    return () => {
      if (notificationResponseListener.current) {
        notificationResponseListener.current.remove();
      }
    };
  }, [router]);
}
