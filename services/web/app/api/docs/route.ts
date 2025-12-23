import { NextResponse } from "next/server";

const EMBED_API_URL = process.env.EMBED_API_URL!;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString(); // limit=20&offset=0
  const r = await fetch(`${EMBED_API_URL}/v1/docs${qs ? `?${qs}` : ""}`, {
    cache: "no-store",
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString(); // confirm=true
  const r = await fetch(`${EMBED_API_URL}/v1/docs${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
