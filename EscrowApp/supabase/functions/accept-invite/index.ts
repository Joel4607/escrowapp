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
      .select("id, transaction_id, token_hash, status, verified_at, recipient_email, claimed_by_user_id")
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
        JSON.stringify({ error: "Invalid invite" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invite.status !== "verified") {
      return new Response(
        JSON.stringify({ error: "Email verification required before accepting" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: sellerUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", invite.recipient_email.toLowerCase().trim())
      .single();

    if (!sellerUser) {
      return new Response(
        JSON.stringify({ error: "Seller account not found. Please verify your email first." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: txError } = await supabase
      .from("transactions")
      .update({
        seller_id: sellerUser.id,
        status: "accepted",
        terms_accepted_by_seller: true,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.transaction_id);

    if (txError) {
      return new Response(
        JSON.stringify({ error: txError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("transaction_invites")
      .update({
        status: "accepted",
        claimed_at: new Date().toISOString(),
        claimed_by_user_id: sellerUser.id,
      })
      .eq("id", invite.id);

    await supabase.from("audit_logs").insert({
      transaction_id: invite.transaction_id,
      user_id: sellerUser.id,
      user_role: "seller",
      action: "invite_accepted",
      description: "Seller accepted transaction via web invite link",
    });

    return new Response(
      JSON.stringify({ accepted: true, transaction_id: invite.transaction_id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("accept-invite error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
