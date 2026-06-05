#!/usr/bin/env node
// Regenerate lib/database.types.ts from the linked Supabase project.
//
// Why this wrapper exists (see memory: gen-types-corrupts-database-types):
//   1. `supabase gen types` prints the CLI "new version available" notice to
//      stdout, which a plain `... > database.types.ts` redirect captures into
//      the file, breaking the TypeScript parser.
//   2. The generator does NOT emit the hand-maintained convenience enum aliases
//      the app imports across many files (TransactionStatus, LedgerType, ...).
//
// This script runs the generator, truncates everything after the final
// `} as const` (dropping any trailing CLI notice), then re-appends the aliases.

const { execFileSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");

const PROJECT_ID = "ktyvdgwdnhgilstuvdtl";
const OUT_PATH = join(__dirname, "..", "lib", "database.types.ts");
const MARKER = "} as const";

const ALIASES = [
  'export type TransactionStatus = Database["public"]["Enums"]["transaction_status"];',
  'export type UserRole = Database["public"]["Enums"]["user_role"];',
  'export type LedgerType = Database["public"]["Enums"]["ledger_type"];',
  'export type LedgerStatus = Database["public"]["Enums"]["ledger_status"];',
  'export type DisputeStatus = Database["public"]["Enums"]["dispute_status"];',
  'export type ResolutionType = Database["public"]["Enums"]["resolution_type"];',
  'export type FraudRiskLevel = Database["public"]["Enums"]["fraud_risk_level"];',
  'export type FraudFlagStatus = Database["public"]["Enums"]["fraud_flag_status"];',
  'export type InviteStatus = Database["public"]["Enums"]["invite_status"];',
  'export type OtpPurpose = Database["public"]["Enums"]["otp_purpose"];',
  'export type ReturnStatus = Database["public"]["Enums"]["return_status"];',
].join("\n");

/** Transform raw `supabase gen types` stdout into the final file contents. */
function build(raw) {
  if (!raw.includes("export type Database")) {
    throw new Error(
      "gen types output did not contain `export type Database` — aborting without writing.",
    );
  }
  const idx = raw.lastIndexOf(MARKER);
  if (idx === -1) {
    throw new Error(
      "Could not find the `} as const` marker in gen types output — aborting without writing.",
    );
  }
  const types = raw.slice(0, idx + MARKER.length).trimEnd();
  return `${types}\n\n${ALIASES}\n`;
}

module.exports = { build };

if (require.main === module) {
  const raw = execFileSync(
    "npx",
    ["supabase", "gen", "types", "typescript", "--project-id", PROJECT_ID],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      // npx resolves to npx.cmd on Windows, which requires a shell.
      shell: process.platform === "win32",
    },
  );
  writeFileSync(OUT_PATH, build(raw));
  console.log("Wrote lib/database.types.ts (types + convenience aliases, CLI notice stripped).");
}
