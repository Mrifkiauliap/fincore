import { getCurrentUser } from "@/lib/auth";
import { getDb, transactionTags } from "@fincore/db";
import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const db = getDb();

    const tags = await db.query.transactionTags.findMany({
      where: eq(transactionTags.userId, user.id),
      orderBy: asc(transactionTags.name),
    });

    return NextResponse.json({ data: tags });
  } catch (error) {
    console.error("GET /api/tags error:", error);
    return NextResponse.json({ error: "Gagal mengambil tag" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    const db = getDb();
    const body = await request.json();

    const { name, color } = body;
    if (!name) {
      return NextResponse.json(
        { error: "Nama tag wajib diisi" },
        { status: 400 },
      );
    }

    const [tag] = await db
      .insert(transactionTags)
      .values({ name, color: color || null, userId: user.id })
      .returning();

    return NextResponse.json({ data: tag }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tags error:", error);
    return NextResponse.json({ error: "Gagal membuat tag" }, { status: 500 });
  }
}
