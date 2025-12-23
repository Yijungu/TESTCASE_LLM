import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  const r = await fetch(`${process.env.EMBED_API_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
