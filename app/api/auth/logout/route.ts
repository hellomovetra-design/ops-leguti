import { NextRequest, NextResponse } from "next/server";
import { MFA_COOKIE,mfaCookieOptions } from "@/lib/mfa-login";
import { SESSION_COOKIE } from "@/lib/auth-token";

export async function POST(req:NextRequest) {
  if(req.headers.get("origin")!==req.nextUrl.origin)return NextResponse.json({error:"Permintaan tidak valid."},{status:403});
  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  response.cookies.set(MFA_COOKIE,"",{...mfaCookieOptions,maxAge:0});
  return response;
}
