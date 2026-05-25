/**
 * One-time script to create an admin user for testing.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *
 * This uses the Supabase service role key to bypass RLS
 * and create both the auth user and the users table row.
 *
 * After running, log in with:
 *   Email: admin@escrowapp.com
 *   Password: Admin@1234
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = "https://ktyvdgwdnhgilstuvdtl.supabase.co"

// You need to paste your service_role key here (find it in Supabase Dashboard > Settings > API)
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

if (!SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_SERVICE_ROLE_KEY.\n" +
    "Set it as an environment variable:\n" +
    "  $env:SUPABASE_SERVICE_ROLE_KEY='your-key-here'\n" +
    "  npx tsx scripts/create-admin.ts\n\n" +
    "Find it in Supabase Dashboard > Settings > API > service_role key"
  )
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  const email = "admin@escrowapp.com"
  const password = "Admin@1234"
  const phone = "+2340000000000"

  console.log("Creating admin auth user...")

  // 1. Create auth user
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

  if (authError) {
    // User might already exist
    if (authError.message.includes("already been registered")) {
      console.log("Auth user already exists, fetching...")
      const { data: { users } } = await supabase.auth.admin.listUsers()
      const existing = users?.find((u) => u.email === email)
      if (!existing) {
        console.error("Could not find existing user")
        process.exit(1)
      }
      console.log("Found existing auth user:", existing.id)

      // Update the users table row to be admin
      const { error: updateError } = await supabase
        .from("users")
        .upsert({
          id: existing.id,
          phone,
          name: "Admin",
          email,
          role: "admin",
          is_verified: true,
          trust_score: 100,
          wallet_balance: 0,
          locked_balance: 0,
        }, { onConflict: "id" })

      if (updateError) {
        console.error("Failed to update users table:", updateError.message)
        process.exit(1)
      }

      console.log("\n✅ Admin user ready!")
      console.log(`   Email:    ${email}`)
      console.log(`   Password: ${password}`)
      return
    }

    console.error("Failed to create auth user:", authError.message)
    process.exit(1)
  }

  const userId = authData.user!.id
  console.log("Auth user created:", userId)

  // 2. Insert into users table
  console.log("Creating users table row...")
  const { error: insertError } = await supabase.from("users").upsert({
    id: userId,
    phone,
    name: "Admin",
    email,
    role: "admin",
    is_verified: true,
    trust_score: 100,
    wallet_balance: 0,
    locked_balance: 0,
  }, { onConflict: "id" })

  if (insertError) {
    console.error("Failed to insert into users table:", insertError.message)
    process.exit(1)
  }

  console.log("\n✅ Admin user created successfully!")
  console.log(`   Email:    ${email}`)
  console.log(`   Password: ${password}`)
}

main().catch(console.error)
