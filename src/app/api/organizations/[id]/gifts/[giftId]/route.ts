import { NextRequest, NextResponse } from "next/server";
import { getGiftView, redeemGift } from "@/lib/organizations/service";
import {
  organizationBody,
  organizationFailure,
  privateHeaders,
} from "@/lib/organizations/http";

type Context = { params: Promise<{ id: string; giftId: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const { id, giftId } = await params;
    return NextResponse.json(
      await getGiftView(id, giftId, req.nextUrl.searchParams.get("key") || ""),
      { headers: privateHeaders },
    );
  } catch (error) {
    return organizationFailure(error);
  }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    const { id, giftId } = await params;
    const key = req.nextUrl.searchParams.get("key") || "";
    await getGiftView(id, giftId, key);
    return NextResponse.json(
      await redeemGift(id, giftId, key, await organizationBody(req)),
      { headers: privateHeaders },
    );
  } catch (error) {
    return organizationFailure(error);
  }
}
