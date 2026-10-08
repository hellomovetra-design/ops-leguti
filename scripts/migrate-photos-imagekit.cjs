// Default is read-only. Run with --apply only after configuring ImageKit.
const fs = require("node:fs");
const crypto = require("node:crypto");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");
const envIndex = process.argv.indexOf("--env");
process.loadEnvFile(envIndex >= 0 ? process.argv[envIndex + 1] : ".env.local");
const apply = process.argv.includes("--apply");
const exportsIK = {};
new Function("require", "exports", ts.transpileModule(fs.readFileSync("lib/imagekit.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(require, exportsIK);
const { uploadToImageKit, fetchFromImageKit, isImageKitConfigured } = exportsIK;
const tables = [
  ["ops_employee_photos", "nik", "storage_path", "ops-profile-photos", false],
  ["ops_user_profiles", "email", "photo_path", "ops-profile-photos", false],
  ["ops_problem_photos", "id", "storage_path", "ops-problem-photos", false],
  ["ops_courier_checks", "id", "photos", "ops-courier-photos", true],
  ["ops_problem_solving_daily", "id", "photos", "ops-daily-photos", true],
  ["ops_barkur", "id", "evidence", "ops-barkur-evidence", true],
];
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
async function main() {
  if (apply && !isImageKitConfigured()) throw Error("Configure IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT before --apply.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  for (const [table, key, column, bucket, array] of tables) {
    let migrated = 0, remaining = 0, already = 0;
    for (let offset = 0; ; offset += 500) {
      const result = await db.from(table).select("*").order(key).range(offset, offset + 499);
      if (result.error) throw Error(table + ": unable to read database.");
      for (const row of result.data) {
        const original = row[column];
        const entries = array ? (original || []).map(p => ({ ...p })) : original ? [{ path: original }] : [];
        const uploaded = [];
        try {
          for (const photo of entries) {
            if (!photo.path) continue;
            if (photo.path.startsWith("imagekit:")) { already++; continue; }
            remaining++;
            if (!apply) continue;
            const source = await db.storage.from(bucket).download(photo.path);
            if (source.error || !source.data) throw Error(table + ": source photo unavailable; nothing deleted.");
            const bytes = Buffer.from(await source.data.arrayBuffer());
            const target = await uploadToImageKit(new File([bytes], "photo", { type: source.data.type || "image/jpeg" }),
              "migrated/" + table + "/" + crypto.randomUUID() + "/photo");
            uploaded.push(target.fileId);
            const verification = await fetchFromImageKit(target.path);
            if (digest(Buffer.from(await verification.arrayBuffer())) !== digest(bytes)) throw Error(table + ": copy verification failed.");
            photo.path = "imagekit:" + target.path;
          }
          if (apply && uploaded.length) {
            const value = array ? entries : entries[0].path;
            let query = db.from(table).update({ [column]: value }).eq(key, row[key]).eq(column, array ? JSON.stringify(original) : original);
            if (row.updated_at) query = query.eq("updated_at", row.updated_at);
            const saved = await query.select(key);
            if (saved.error || saved.data?.length !== 1) throw Error(table + ": record changed or update failed; original retained. Rerun audit.");
            migrated += uploaded.length;
            uploaded.length = 0; // Commit successful; never delete referenced ImageKit copies.
          }
        } finally {
          // An UPDATE response can be lost after commit. Never delete a copy that
          // might already be referenced; audit/reconcile separately on failure.
          if (uploaded.length) console.error("Copies retained for reconciliation after an incomplete migration step: " + uploaded.length);
        }
      }
      if (result.data.length < 500) break;
    }
    console.log(JSON.stringify({ table, mode: apply ? "apply" : "audit", alreadyImageKit: already, legacyReferences: remaining, migrated }));
  }
  console.log("Supabase originals retained. Existing application URLs and public tokens unchanged.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
