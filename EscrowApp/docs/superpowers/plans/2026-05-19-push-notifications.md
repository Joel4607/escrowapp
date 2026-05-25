# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver real push notifications to buyer/seller when key transaction events occur, even when the app is closed.

**Architecture:** PostgreSQL trigger detects transaction status changes → calls Supabase Edge Function via pg_net → Edge Function looks up recipient's Expo push token → calls Expo Push API. Client registers push token on login and handles notification taps to navigate to the relevant transaction.

**Tech Stack:** expo-notifications, Supabase Edge Functions (Deno), pg_net extension, Expo Push API

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `supabase/migrations/009_push_notifications.sql` | push_tokens table, RLS, pg_net enable, DB trigger |
| Create | `supabase/functions/send-push-notification/index.ts` | Edge Function: determine recipient, call Expo Push API |
| Create | `hooks/use-notifications.ts` | Request permission, register push token, handle notification taps |
| Modify | `app.json` | Add expo-notifications plugin + EAS projectId |
| Modify | `app/_layout.tsx:16-37` | Mount useNotifications hook inside AuthProvider |
| Modify | `lib/database.types.ts:352-376` | Add push_tokens table type |

---

### Task 1: EAS Setup + App Config

**Files:**
- Modify: `app.json`

This task requires terminal commands and user interaction (Expo login). The engineer must do these steps manually.

- [ ] **Step 1: Log in to Expo (if not already)**

Run:
```bash
npx expo login
```
Follow the prompts. If you don't have an account, create one at https://expo.dev/signup first.

- [ ] **Step 2: Initialize EAS and get projectId**

Run:
```bash
cd "C:\Users\Joel Ago\Desktop\escrowapplocal\EscrowApp"
npx eas init
```
This creates a projectId and may update app.json automatically. Note the projectId — it looks like a UUID.

- [ ] **Step 3: Update app.json with notifications plugin and projectId**

Replace the full `app.json` with this (substituting YOUR_PROJECT_ID with the UUID from Step 2):

```json
{
  "expo": {
    "name": "EscrowApp",
    "slug": "EscrowApp",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/images/icon.png",
    "scheme": "escrowapp",
    "userInterfaceStyle": "automatic",
    "newArchEnabled": true,
    "extra": {
      "eas": {
        "projectId": "YOUR_PROJECT_ID"
      }
    },
    "ios": {
      "supportsTablet": true
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#E6F4FE",
        "foregroundImage": "./assets/images/android-icon-foreground.png",
        "backgroundImage": "./assets/images/android-icon-background.png",
        "monochromeImage": "./assets/images/android-icon-monochrome.png"
      },
      "edgeToEdgeEnabled": true,
      "predictiveBackGestureEnabled": false
    },
    "web": {
      "output": "static",
      "bundler": "metro",
      "favicon": "./assets/images/favicon.png"
    },
    "plugins": [
      "expo-router",
      [
        "expo-splash-screen",
        {
          "image": "./assets/images/splash-icon.png",
          "imageWidth": 200,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff",
          "dark": {
            "backgroundColor": "#000000"
          }
        }
      ],
      "expo-secure-store",
      "expo-font",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/icon.png",
          "color": "#1a7f37"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true,
      "reactCompiler": true
    }
  }
}
```

- [ ] **Step 4: Rebuild native project**

Run:
```bash
npx expo prebuild --clean
```
Then restart the dev server:
```bash
npx expo start --clear
```

- [ ] **Step 5: Commit**

```bash
git add app.json
git commit -m "chore: add expo-notifications plugin and EAS projectId"
```

---

### Task 2: Database — push_tokens table + notification trigger

**Files:**
- Create: `supabase/migrations/009_push_notifications.sql`

This SQL must be run in the **Supabase SQL Editor** (Dashboard → SQL Editor → New query).

- [ ] **Step 1: Create the migration file locally**

Create `supabase/migrations/009_push_notifications.sql` with this content:

```sql
-- ============================================
-- Push Notifications Infrastructure
-- 1. push_tokens table for storing Expo push tokens
-- 2. pg_net extension for HTTP calls from triggers
-- 3. Trigger function to call Edge Function on status change
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable pg_net for HTTP requests from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Push tokens table
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own push tokens"
  ON push_tokens FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own push tokens"
  ON push_tokens FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own push tokens"
  ON push_tokens FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own push tokens"
  ON push_tokens FOR DELETE
  USING (user_id = auth.uid());

-- Grant access to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO authenticated;

-- Trigger function: fires on transaction status change, calls Edge Function
CREATE OR REPLACE FUNCTION notify_transaction_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status actually changes
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM net.http_post(
      url := 'https://ktyvdgwdnhgilstuvdtl.supabase.co/functions/v1/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object(
        'transaction_id', NEW.id,
        'old_status', OLD.status::text,
        'new_status', NEW.status::text,
        'buyer_id', NEW.buyer_id,
        'seller_id', NEW.seller_id,
        'item_name', NEW.item_name,
        'price', NEW.price
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_transaction_status_change
  AFTER UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION notify_transaction_status_change();
```

- [ ] **Step 2: Enable pg_net extension in Supabase Dashboard**

Go to **Supabase Dashboard → Database → Extensions**. Search for `pg_net` and enable it. This is required before the SQL above will work.

- [ ] **Step 3: Run the SQL in Supabase SQL Editor**

Copy the full SQL from Step 1 and run it in the SQL Editor. Expected: "Success. No rows returned."

If you get an error about pg_net already existing, that's fine — the `IF NOT EXISTS` handles it.

- [ ] **Step 4: Set the service_role_key in Supabase settings**

The trigger uses `current_setting('app.settings.service_role_key')` to authenticate with the Edge Function. You need to set this:

Go to **Supabase Dashboard → Project Settings → API** and copy the `service_role` key (the secret one, NOT the anon key).

Then run this in the SQL Editor (replace `YOUR_SERVICE_ROLE_KEY` with the actual key):

```sql
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
```

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/009_push_notifications.sql
git commit -m "feat: add push_tokens table and notification trigger"
```

---

### Task 3: Edge Function — send-push-notification

**Files:**
- Create: `supabase/functions/send-push-notification/index.ts`

This Edge Function can be deployed via the **Supabase Dashboard** (Edge Functions → Create) or via Supabase CLI. We'll write the code locally and provide both deployment options.

- [ ] **Step 1: Create the Edge Function file**

Create directory `supabase/functions/send-push-notification/` and file `index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface NotificationPayload {
  transaction_id: string;
  old_status: string;
  new_status: string;
  buyer_id: string;
  seller_id: string | null;
  item_name: string;
  price: number;
}

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { transactionId: string };
  sound: "default";
}

function buildNotification(
  payload: NotificationPayload
): { recipientId: string; title: string; body: string } | null {
  const { new_status, buyer_id, seller_id, item_name, price } = payload;
  const formattedPrice = `₵${Number(price).toFixed(2)}`;

  switch (new_status) {
    case "accepted":
      return {
        recipientId: buyer_id,
        title: "Transaction Accepted",
        body: `Seller accepted your transaction for ${item_name}`,
      };

    case "rejected":
      return {
        recipientId: buyer_id,
        title: "Transaction Rejected",
        body: `Your transaction for ${item_name} was rejected`,
      };

    case "funded":
      if (!seller_id) return null;
      return {
        recipientId: seller_id,
        title: "Escrow Funded",
        body: `Buyer locked ${formattedPrice} in escrow for ${item_name}`,
      };

    case "released":
      if (!seller_id) return null;
      return {
        recipientId: seller_id,
        title: "Funds Released",
        body: `You received ${formattedPrice} for ${item_name}`,
      };

    case "disputed":
      // Need to determine who raised the dispute to notify the OTHER party
      return null; // Handled separately below

    default:
      return null;
  }
}

async function getDisputeRecipient(
  transactionId: string,
  buyerId: string,
  sellerId: string | null
): Promise<string | null> {
  if (!sellerId) return null;

  const { data } = await supabase
    .from("disputes")
    .select("opened_by")
    .eq("transaction_id", transactionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  // Notify the OTHER party
  return data.opened_by === buyerId ? sellerId : buyerId;
}

async function getTokens(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("user_id", userId);

  return (data ?? []).map((row) => row.token);
}

async function sendExpoPush(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("Expo Push API error:", text);
  }
}

Deno.serve(async (req) => {
  try {
    // Verify method
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload: NotificationPayload = await req.json();

    // Validate required fields
    if (!payload.transaction_id || !payload.new_status || !payload.buyer_id) {
      return new Response("Missing required fields", { status: 400 });
    }

    let recipientId: string | null = null;
    let title = "";
    let body = "";

    if (payload.new_status === "disputed") {
      // Special case: determine who to notify from disputes table
      recipientId = await getDisputeRecipient(
        payload.transaction_id,
        payload.buyer_id,
        payload.seller_id
      );
      if (recipientId) {
        title = "Dispute Raised";
        body = `A dispute was raised on ${payload.item_name}`;
      }
    } else {
      const notification = buildNotification(payload);
      if (notification) {
        recipientId = notification.recipientId;
        title = notification.title;
        body = notification.body;
      }
    }

    if (!recipientId) {
      return new Response(
        JSON.stringify({ message: "No notification needed for this status change" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Look up push tokens for recipient
    const tokens = await getTokens(recipientId);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push tokens found for recipient" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build messages for all tokens (user may have multiple devices)
    const messages: PushMessage[] = tokens.map((token) => ({
      to: token,
      title,
      body,
      data: { transactionId: payload.transaction_id },
      sound: "default",
    }));

    await sendExpoPush(messages);

    return new Response(
      JSON.stringify({ message: `Sent ${messages.length} notification(s)` }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy the Edge Function**

**Option A — Via Supabase Dashboard (easier, no CLI needed):**
1. Go to **Supabase Dashboard → Edge Functions → Create a new function**
2. Name it `send-push-notification`
3. Paste the code from Step 1 into the editor
4. Click Deploy

**Option B — Via Supabase CLI:**
```bash
npx supabase functions deploy send-push-notification --project-ref ktyvdgwdnhgilstuvdtl
```
(Requires `npx supabase login` first)

- [ ] **Step 3: Verify the function URL**

After deploying, the function URL should be:
```
https://ktyvdgwdnhgilstuvdtl.supabase.co/functions/v1/send-push-notification
```

This matches what the DB trigger expects. No changes needed.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-push-notification/index.ts
git commit -m "feat: add send-push-notification Edge Function"
```

---

### Task 4: Client — useNotifications hook

**Files:**
- Create: `hooks/use-notifications.ts`

- [ ] **Step 1: Create the hook file**

Create `hooks/use-notifications.ts`:

```typescript
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowInForeground: true,
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
  const platform = Platform.OS; // "ios" or "android"

  const { error } = await supabase.from("push_tokens").upsert(
    {
      user_id: userId,
      token,
      platform,
    },
    { onConflict: "user_id,token" }
  );

  if (error) {
    console.error("Failed to save push token:", error.message);
  }
}

export function useNotifications() {
  const { session } = useAuth();
  const router = useRouter();
  const notificationResponseListener = useRef<Notifications.Subscription | null>(null);

  // Register push token when user is logged in
  useEffect(() => {
    if (!session?.user?.id) return;

    registerForPushNotifications().then((token) => {
      if (token) {
        savePushToken(session.user.id, token);
      }
    });
  }, [session?.user?.id]);

  // Handle notification taps — navigate to the transaction
  useEffect(() => {
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
        Notifications.removeNotificationSubscription(
          notificationResponseListener.current
        );
      }
    };
  }, [router]);
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/use-notifications.ts
git commit -m "feat: add useNotifications hook for push token registration and tap handling"
```

---

### Task 5: Wire up — mount hook in root layout

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Create a wrapper component and mount the hook**

The `useNotifications` hook must run inside `AuthProvider` (it uses `useAuth`). Add a wrapper component inside the provider:

Replace the full content of `app/_layout.tsx` with:

```typescript
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/hooks/use-notifications";
import { ThemeProvider } from "@react-navigation/native";
import { PortalHost } from "@rn-primitives/portal";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../global.css";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { NAV_THEME } from "@/lib/theme";

export const unstable_settings = {
  anchor: "(tabs)",
};

function AppContent() {
  const { session } = useAuth();

  // Register push notifications when user is authenticated
  useNotifications();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="transaction" />
      <Stack.Screen
        name="modal"
        options={{ presentation: "modal", title: "Modal" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme ?? "light";

  return (
    <ThemeProvider value={NAV_THEME[theme]}>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
      <StatusBar style="auto" />
      <PortalHost />
    </ThemeProvider>
  );
}
```

Key change: Extracted `Stack` into `AppContent` component that lives inside `AuthProvider`, so `useNotifications()` (which calls `useAuth()`) has access to the auth context.

- [ ] **Step 2: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: mount useNotifications in root layout"
```

---

### Task 6: Update TypeScript types

**Files:**
- Modify: `lib/database.types.ts`

- [ ] **Step 1: Add push_tokens table type**

Add the `push_tokens` entry inside `Database["public"]["Tables"]`, after the `ratings` table (before the closing `};` of Tables). Insert this block right after the `ratings` table definition:

```typescript
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          token: string;
          platform: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          token: string;
          platform: string;
          created_at?: string;
        };
        Update: {
          token?: string;
          platform?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
```

- [ ] **Step 2: Commit**

```bash
git add lib/database.types.ts
git commit -m "feat: add push_tokens type to database types"
```

---

### Task 7: Manual E2E Verification

No files to change — this is a testing checklist.

- [ ] **Step 1: Verify push token registration**

1. Reload app on Device A (buyer)
2. App should request notification permission — tap **Allow**
3. Check Supabase Dashboard → Table Editor → `push_tokens` — should see a row with the buyer's user_id and an `ExponentPushToken[...]` value

- [ ] **Step 2: Verify on Device B**

1. Reload app on Device B (seller)
2. Allow notification permission
3. Check `push_tokens` table — should now have 2 rows (one per device/user)

- [ ] **Step 3: Test "accepted" notification**

1. Device A (buyer): Create a new transaction, share code, mark as invited
2. Device B (seller): Join with code, tap "Accept Transaction"
3. Device A should receive a push notification: **"Transaction Accepted"** — "Seller accepted your transaction for {item_name}"
4. Tap the notification → should navigate to the transaction detail screen

- [ ] **Step 4: Test "funded" notification**

1. Device A: Add money to wallet if needed, then tap "Lock Funds in Escrow"
2. Device B should receive: **"Escrow Funded"** — "Buyer locked ₵X.XX in escrow for {item_name}"

- [ ] **Step 5: Test "released" notification**

1. Device B: Generate delivery token
2. Device A: Enter token, confirm delivery
3. Device A: Release funds
4. Device B should receive: **"Funds Released"** — "You received ₵X.XX for {item_name}"

- [ ] **Step 6: Test "disputed" notification**

1. Start a new transaction, go through to "delivered" status
2. Device A (buyer): Tap "Raise Dispute", fill reason, submit
3. Device B (seller) should receive: **"Dispute Raised"** — "A dispute was raised on {item_name}"

- [ ] **Step 7: Test "rejected" notification**

1. Create another transaction, share code
2. Device B: Join, tap "Reject"
3. Device A should receive: **"Transaction Rejected"**

---

### Troubleshooting

**"No push tokens found for recipient"** — Check `push_tokens` table has rows. User may have denied notification permission.

**Trigger not firing** — Run this in SQL Editor to verify the trigger exists:
```sql
SELECT tgname FROM pg_trigger WHERE tgrelid = 'transactions'::regclass;
```
Should list `on_transaction_status_change`.

**pg_net errors** — Check if extension is enabled: Dashboard → Database → Extensions → search "pg_net". Must be ON.

**Edge Function not receiving requests** — Check Edge Function logs: Dashboard → Edge Functions → send-push-notification → Logs.

**Notifications not appearing on iOS** — Physical device required. Push notifications do NOT work on iOS Simulator. Must test on real iPhone.

**Notifications not appearing on Android emulator** — Works on most emulators but requires Google Play Services. If not working, test on physical device.

**service_role_key not found** — The trigger uses `current_setting('app.settings.service_role_key')`. If you see auth errors in Edge Function logs, re-run the `ALTER DATABASE` command from Task 2 Step 4 and reconnect.
