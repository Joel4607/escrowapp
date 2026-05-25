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

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
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
    const { invite_id, token } = await req.json();
    if (!invite_id || !token) {
      return new Response(
        JSON.stringify({ error: "invite_id and token are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, transaction_id, recipient_email, status, expires_at, token_hash, verified_at")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) {
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.token_hash !== tokenHash) {
      return new Response(
        JSON.stringify({ error: "Invalid invite link" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "This invite has expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (["revoked", "rejected"].includes(invite.status)) {
      return new Response(
        JSON.stringify({ error: `This invite has been ${invite.status}` }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status === "pending") {
      await supabase
        .from("transaction_invites")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", invite.id);
    }

    const { data: tx } = await supabase
      .from("transactions")
      .select("id, item_name, price, delivery_deadline, inspection_period, status, transaction_code, buyer_id, item_description, item_condition")
      .eq("id", invite.transaction_id)
      .single();

    if (!tx) {
      return new Response(
        JSON.stringify({ error: "Transaction not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: buyer } = await supabase
      .from("users")
      .select("name")
      .eq("id", tx.buyer_id)
      .single();

    const isVerified = invite.verified_at !== null;

    const response: Record<string, unknown> = {
      invite_id: invite.id,
      invite_status: invite.status === "pending" ? "viewed" : invite.status,
      is_verified: isVerified,
      transaction_id: tx.id,
      transaction_code: tx.transaction_code,
      item_name: tx.item_name,
      price: tx.price,
      buyer_name: buyer?.name || "Buyer",
      expires_at: invite.expires_at,
    };

    if (isVerified) {
      response.item_description = tx.item_description;
      response.item_condition = tx.item_condition;
      response.delivery_deadline = tx.delivery_deadline;
      response.inspection_period = tx.inspection_period;
      response.transaction_status = tx.status;
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("verify-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
