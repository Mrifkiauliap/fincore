import getConfig from "@fincore/config";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const DASHBOARD_URL = getConfig("DASHBOARD_URL");

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  cookieStore.delete("fincore_session");

  return NextResponse.json({
    success: true,
    redirect: `${DASHBOARD_URL}/login`,
  });
}
