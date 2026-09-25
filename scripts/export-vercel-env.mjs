import fs from "node:fs";
import path from "node:path";

const source = process.argv[2] || ".env.local";
const target = process.argv[3] || ".tmp/vercel.env";
const allowed = new Set([
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTERNAL_AUTH_SECRET",
  "INTERNAL_ADMIN_EMAIL",
  "INTERNAL_ADMIN_EMAIL_ALIASES",
  "INTERNAL_ADMIN_PASSWORD_SALT",
  "INTERNAL_ADMIN_PASSWORD_HASH",
]);

const selected = fs.readFileSync(source, "utf8")
  .split(/\r?\n/)
  .filter((line) => allowed.has(line.split("=", 1)[0]));

if (selected.length !== allowed.size) {
  throw new Error(`Expected ${allowed.size} variables, found ${selected.length}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${selected.join("\n")}\n`, { mode: 0o600 });
console.log(`Prepared ${selected.length} environment variables for Vercel.`);
