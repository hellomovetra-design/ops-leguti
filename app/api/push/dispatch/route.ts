import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchPush, pushConfigured } from "@/lib/web-push";

// A database webhook or scheduler can call this to deliver SQL-originated events/retries.
export async function POST(req: NextRequest) {
  const secret = process.env.WEB_PUSH_DISPATCH_SECRET;
  const given = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const receivedBytes = Buffer.from(given), expectedBytes = Buffer.from(expected);
  if (!secret || receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!pushConfigured()) return NextResponse.json({ error: "Push not configured" }, { status: 503 });
  await dispatchPush();
  return NextResponse.json({ ok: true });
}
