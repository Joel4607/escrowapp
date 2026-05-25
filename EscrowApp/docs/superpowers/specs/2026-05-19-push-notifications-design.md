# Push Notifications Design Spec

## Overview

Add real push notifications to the escrow app so users are alerted when key transaction events occur, even when the app is closed. Uses Expo Push API triggered by Supabase Edge Functions.

## Architecture

```
Client updates transaction status in DB
  → PostgreSQL trigger detects status change
  → Trigger calls Edge Function via pg_net HTTP POST
  → Edge Function looks up recipient push token(s) from push_tokens table
  → Edge Function calls Expo Push API (https://exp.host/--/api/v2/push/send)
  → Notification delivered to device
```

## Notification Events

| Status Change | Recipient | Title | Body |
|---------------|-----------|-------|------|
| `* → accepted` | Buyer | Transaction Accepted | {seller_name} accepted your transaction for {item_name} |
| `* → rejected` | Buyer | Transaction Rejected | Your transaction for {item_name} was rejected |
| `* → funded` | Seller | Escrow Funded | Buyer locked {price} in escrow for {item_name} |
| `* → released` | Seller | Funds Released | You received {price} for {item_name} |
| `* → disputed` | Other party (not the one who raised it) | Dispute Raised | A dispute was raised on {item_name} |

All notifications include `data: { transactionId }` so tapping opens the relevant transaction detail screen.

## Components

### 1. Database: `push_tokens` table

```sql
CREATE TABLE push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push tokens"
  ON push_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON push_tokens TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE push_tokens;
```

### 2. Database: trigger on transactions

```sql
CREATE OR REPLACE FUNCTION notify_transaction_status_change()
RETURNS TRIGGER AS $$
DECLARE
  payload JSONB;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    payload := jsonb_build_object(
      'transaction_id', NEW.id,
      'old_status', OLD.status,
      'new_status', NEW.status,
      'buyer_id', NEW.buyer_id,
      'seller_id', NEW.seller_id,
      'item_name', NEW.item_name,
      'price', NEW.price
    );

    PERFORM net.http_post(
      url := '<EDGE_FUNCTION_URL>/send-push-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer <SUPABASE_SERVICE_ROLE_KEY>'
      ),
      body := payload
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

Note: `<EDGE_FUNCTION_URL>` and `<SUPABASE_SERVICE_ROLE_KEY>` are replaced with actual values when deploying. The service role key is safe here because the trigger function is SECURITY DEFINER and only runs server-side.

### 3. Supabase Edge Function: `send-push-notification`

Location: `supabase/functions/send-push-notification/index.ts`

Responsibilities:
- Validate incoming payload (transaction_id, old_status, new_status, buyer_id, seller_id)
- Determine recipient and message based on status transition
- Query `push_tokens` table for recipient's token(s) using service role client
- Call Expo Push API with formatted message
- Return 200 on success, log errors

Message determination logic:
- `accepted` → notify buyer_id
- `rejected` → notify buyer_id
- `funded` → notify seller_id
- `released` → notify seller_id
- `disputed` → notify the OTHER party (if opened_by = buyer, notify seller; vice versa). Determine opener from `disputes` table query.

Expo Push API call format:
```json
{
  "to": "ExponentPushToken[xxx]",
  "title": "Transaction Accepted",
  "body": "Seller accepted your transaction for iPhone 14",
  "data": { "transactionId": "uuid-here" },
  "sound": "default"
}
```

### 4. Client: `useNotifications` hook

Location: `hooks/use-notifications.ts`

On mount:
1. Request notification permissions via `Notifications.requestPermissionsAsync()`
2. Get Expo push token via `Notifications.getExpoPushTokenAsync({ projectId })`
3. Upsert token into `push_tokens` table (user_id, token, platform)
4. Register `Notifications.addNotificationResponseReceivedListener` for tap handling
5. On tap: extract `transactionId` from notification data, navigate to `/transaction/[id]`

Called from: root `_layout.tsx` (after auth is confirmed)

### 5. App config changes

`app.json` additions:
- Add `expo-notifications` to plugins array
- Add `extra.eas.projectId` (from `npx eas init`)
- Add Android notification icon/color config

### 6. Migration file

`supabase/migrations/009_push_notifications.sql`:
- Create `push_tokens` table with RLS
- Enable `pg_net` extension (for HTTP calls from triggers)
- Create trigger function `notify_transaction_status_change`
- Create trigger on transactions table

## Setup Prerequisites

1. User must have Expo account and run `npx eas init` to get projectId
2. User must deploy Edge Function via Supabase CLI (`supabase functions deploy send-push-notification`)
3. User must enable `pg_net` extension in Supabase Dashboard (Database → Extensions)
4. Trigger function needs actual Edge Function URL and service role key

## Files to Create

1. `supabase/migrations/009_push_notifications.sql` — table + trigger
2. `supabase/functions/send-push-notification/index.ts` — Edge Function
3. `hooks/use-notifications.ts` — client hook

## Files to Modify

1. `app.json` — add expo-notifications plugin + projectId
2. `app/_layout.tsx` — mount useNotifications hook after auth
3. `lib/database.types.ts` — add push_tokens type

## Error Handling

- If push token request fails (user denies permission): silently skip, app works without notifications
- If Edge Function fails: log error, don't block the transaction status update (trigger is AFTER UPDATE, not BEFORE)
- If Expo Push API returns errors for specific tokens: delete invalid tokens from push_tokens table
- If pg_net extension not enabled: trigger silently fails, no crash

## Security

- Edge Function authenticated via service role key (not anon key)
- push_tokens RLS: users can only read/write their own tokens
- Trigger function is SECURITY DEFINER: runs with elevated privileges server-side only
- No sensitive data in notification body (no amounts in push body visible on lock screen — actually amounts are fine for this use case as the user is the recipient)
