import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    db: { schema: "public" },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    const supabase = getSupabase();
    const { transaction_id } = await req.json();

    if (!transaction_id) {
      return jsonResponse({ error: "transaction_id is required" }, 400);
    }

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("id, buyer_id, seller_id, item_name, price, transaction_code, status")
      .eq("id", transaction_id)
      .single();

    if (txError || !tx) {
      return jsonResponse({ error: "Transaction not found" }, 404);
    }

    if (tx.status !== "released") {
      return jsonResponse({ error: "Transaction is not released yet" }, 400);
    }

    if (!tx.seller_id) {
      return jsonResponse({ message: "No seller assigned" });
    }

    const { data: existingEmailLog } = await supabase
      .from("audit_logs")
      .select("id")
      .eq("transaction_id", tx.id)
      .eq("action", "release_email_sent")
      .limit(1)
      .maybeSingle();

    if (existingEmailLog) {
      return jsonResponse({ message: "Release email already sent", already_sent: true });
    }

    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const jwt = authHeader.replace("Bearer ", "");
      const { data: authData, error: authError } = await supabase.auth.getUser(jwt);

      if (authError || !authData.user) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const callerId = authData.user.id;
      if (callerId !== tx.buyer_id && callerId !== tx.seller_id) {
        return jsonResponse({ error: "You cannot send this transaction email" }, 403);
      }
    }

    const { data: seller } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", tx.seller_id)
      .single();

    if (!seller?.email) {
      return jsonResponse({ message: "No seller email found" });
    }

    const formattedPrice = `GHS ${Number(tx.price).toFixed(2)}`;
    const sellerName = seller.name || "Seller";
    const transactionCode = tx.transaction_code || transaction_id;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    if (resendKey) {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: "EscrowApp <onboarding@resend.dev>",
          to: [seller.email],
          subject: `Deposit Alert: ${formattedPrice} released to your account`,
          text: [
            `Hi ${sellerName},`,
            "",
            `${formattedPrice} has been deposited into your EscrowApp account.`,
            `This simulated payment was released from escrow for transaction ${transactionCode}.`,
            `Item: ${tx.item_name}`,
            "",
            "Academic Prototype Notice: This is a final-year project demonstration. No real money was collected, held, transferred, or paid out. All wallet balances and escrow operations are simulated.",
          ].join("\n"),
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
              <h2 style="color: #1a7f37;">Deposit Alert</h2>
              <p>Hi ${sellerName},</p>
              <p>
                <strong>${formattedPrice}</strong> has been deposited into your EscrowApp account.
              </p>
              <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0; font-size: 18px; font-weight: bold; color: #1a7f37;">
                  Simulated payment received: ${formattedPrice}
                </p>
                <p style="margin: 6px 0 0; color: #166534; font-size: 14px;">
                  Released from escrow into your account balance
                </p>
              </div>
              <p>Transaction: <strong>${transactionCode}</strong></p>
              <p>Item: <strong>${tx.item_name}</strong></p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <div style="background: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 8px;">
                <p style="margin: 0; color: #92400e; font-size: 13px;">
                  <strong>Academic Prototype Notice:</strong> This is a project demonstration.
                  No real money was collected, held, transferred, or paid out.
                  All wallet balances and escrow operations are simulated.
                </p>
              </div>
            </div>
          `,
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error("Resend release email error:", errorText);
        return jsonResponse(
          { error: "Failed to send release email", details: errorText },
          502
        );
      }
    } else {
      console.log(
        `[RELEASE EMAIL] To: ${seller.email}, Amount: ${formattedPrice}, TX: ${tx.transaction_code}`
      );
    }

    await supabase.from("audit_logs").insert({
      transaction_id: tx.id,
      user_id: tx.seller_id,
      user_role: "seller",
      action: "release_email_sent",
      description: `Release email sent to ${seller.email}`,
      metadata: {
        email: seller.email,
        transaction_code: tx.transaction_code,
        amount: tx.price,
      },
    });

    return jsonResponse({ message: "Release email sent", to: seller.email });
  } catch (error) {
    console.error("send-release-email error:", error);
    const message = error instanceof Error ? error.message : "Something went wrong";
    return jsonResponse({ error: message }, 500);
  }
});
