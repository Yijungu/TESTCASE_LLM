import { NextResponse } from "next/server";

const BASE = process.env.EMBED_API_URL!;

export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${BASE}/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
