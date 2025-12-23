import { NextRequest, NextResponse } from "next/server";

const EMBED_API_URL = process.env.EMBED_API_URL!;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const r = await fetch(`${EMBED_API_URL}/v1/docs/${id}`, {
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  const r = await fetch(`${EMBED_API_URL}/v1/docs/${id}`, {
    method: "DELETE",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
