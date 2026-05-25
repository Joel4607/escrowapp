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

async function hashOtp(otp: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(otp);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

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
    const { invite_id, token, otp } = await req.json();
    if (!invite_id || !token || !otp) {
      return new Response(
        JSON.stringify({ error: "invite_id, token, and otp are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tokenHash = await hashToken(token);

    const { data: invite, error: inviteError } = await supabase
      .from("transaction_invites")
      .select("id, recipient_email, token_hash, status, expires_at, transaction_id")
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

    const { data: otpChallenge, error: otpError } = await supabase
      .from("otp_challenges")
      .select("id, otp_hash, expires_at, consumed_at, attempt_count")
      .eq("transaction_invite_id", invite.id)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpChallenge) {
      return new Response(
        JSON.stringify({ error: "No pending verification. Please request a new code." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (new Date(otpChallenge.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Verification code has expired. Please request a new one." }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (otpChallenge.attempt_count >= 5) {
      return new Response(
        JSON.stringify({ error: "Too many attempts. Please request a new code." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("otp_challenges")
      .update({ attempt_count: otpChallenge.attempt_count + 1 })
      .eq("id", otpChallenge.id);

    const otpHash = await hashOtp(otp.trim());
    if (otpHash !== otpChallenge.otp_hash) {
      return new Response(
        JSON.stringify({ error: "Invalid verification code" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from("otp_challenges")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otpChallenge.id);

    await supabase
      .from("transaction_invites")
      .update({ status: "verified", verified_at: new Date().toISOString() })
      .eq("id", invite.id);

    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === invite.recipient_email.toLowerCase()
    );

    let sessionData = null;

    if (existingUser) {
      const { data: linkData } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: invite.recipient_email,
      });
      if (linkData?.properties?.hashed_token) {
        const { data: verifyData } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: "magiclink",
        });
        sessionData = verifyData?.session;
      }
    } else {
      const tempPassword = crypto.randomUUID();
      const { data: newUser } = await supabase.auth.admin.createUser({
        email: invite.recipient_email,
        password: tempPassword,
        email_confirm: true,
      });

      if (newUser?.user) {
        await supabase.from("users").insert({
          id: newUser.user.id,
          email: invite.recipient_email,
          phone: "",
          role: "seller",
          name: invite.recipient_email.split("@")[0],
        });

        const { data: signInData } = await supabase.auth.admin.generateLink({
          type: "magiclink",
          email: invite.recipient_email,
        });
        if (signInData?.properties?.hashed_token) {
          const { data: verifyData } = await supabase.auth.verifyOtp({
            token_hash: signInData.properties.hashed_token,
            type: "magiclink",
          });
          sessionData = verifyData?.session;
        }
      }
    }

    const { data: tx } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", invite.transaction_id)
      .single();

    const { data: buyer } = await supabase
      .from("users")
      .select("name")
      .eq("id", tx?.buyer_id)
      .single();

    return new Response(
      JSON.stringify({
        verified: true,
        session: sessionData ? {
          access_token: sessionData.access_token,
          refresh_token: sessionData.refresh_token,
        } : null,
        transaction: tx ? {
          id: tx.id,
          transaction_code: tx.transaction_code,
          item_name: tx.item_name,
          item_description: tx.item_description,
          item_condition: tx.item_condition,
          price: tx.price,
          delivery_deadline: tx.delivery_deadline,
          inspection_period: tx.inspection_period,
          status: tx.status,
          buyer_name: buyer?.name || "Buyer",
        } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("verify-otp error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
