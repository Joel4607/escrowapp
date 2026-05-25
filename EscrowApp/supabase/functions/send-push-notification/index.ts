import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "public" },
  });
}

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
      return null; // Handled separately

    default:
      return null;
  }
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
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const supabase = getSupabase();
    const payload: NotificationPayload = await req.json();

    if (!payload.transaction_id || !payload.new_status || !payload.buyer_id) {
      return new Response("Missing required fields", { status: 400 });
    }

    let recipientId: string | null = null;
    let title = "";
    let body = "";

    if (payload.new_status === "disputed") {
      if (payload.seller_id) {
        const { data } = await supabase
          .from("disputes")
          .select("opened_by")
          .eq("transaction_id", payload.transaction_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (data) {
          recipientId = data.opened_by === payload.buyer_id
            ? payload.seller_id
            : payload.buyer_id;
          title = "Dispute Raised";
          body = `A dispute was raised on ${payload.item_name}`;
        }
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

    const { data: tokenRows } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", recipientId);

    const tokens = (tokenRows ?? []).map((row) => row.token);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ message: "No push tokens found for recipient" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

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
