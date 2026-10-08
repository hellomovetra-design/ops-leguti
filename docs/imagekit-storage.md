# Photo storage rollout

User uploads: profiles, employee photos, problem evidence, courier checks, daily solving and BARKUR.
Static UI assets (logos, illustrations, default avatar) remain application assets, not user uploads.

Browser requests remain same-origin application API URLs. The server streams bytes from ImageKit;
never redirect to ImageKit or expose its private key/signed URL to the browser.
Existing login/role checks and courier public-photo tokens remain in place.
New ImageKit uploads are private; the server signs short-lived upstream requests.
Reference: https://imagekit.io/docs/media-delivery-basic-security

1. Configure IMAGEKIT_PRIVATE_KEY and IMAGEKIT_URL_ENDPOINT in local secure environment and Vercel Production.
   Never use NEXT_PUBLIC_ for the private key. Do not commit credentials.
2. Keep IMAGEKIT_REQUIRED unset until configuration is ready. Without ImageKit, existing Supabase fallback stays available.
3. Deploy the proxy/upload changes first, then test upload and viewing for all six modules using authorized accounts.
4. Audit: node scripts/migrate-photos-imagekit.cjs
5. Copy and switch references: node scripts/migrate-photos-imagekit.cjs --apply
   Optional secure env file: --env path-to-env-file
   Each copy is SHA-256 verified before a conditional database update. Originals are not deleted.
   Concurrently modified records cause an abort; rerun audit/migration instead of overwriting.
   Courier photo tokens and documentation URLs are preserved. The command is resumable.
6. Audit again; all legacyReferences should be zero.
7. Set IMAGEKIT_REQUIRED=true on Production and redeploy to prevent new uploads silently falling back.
8. Verify old report links, privacy, and real device viewing before separately planning Supabase cleanup.

Missing credentials are a rollout blocker, not evidence of successful migration.
ImageKit proxying avoids a browser dependency on the ImageKit hostname, but cannot guarantee
access if the application's own hostname or the server's upstream connection is blocked.
