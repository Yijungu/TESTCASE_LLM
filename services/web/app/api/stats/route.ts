import { NextResponse } from "next/server";

const BASE = process.env.EMBED_API_URL!;

export async function GET() {
  const r = await fetch(`${BASE}/stats`);
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
