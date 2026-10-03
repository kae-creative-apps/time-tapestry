import { guardRequest } from "@/lib/security/request";
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
    const gift = await getGiftView(id, giftId, key);
    const body = await organizationBody(req);
    await guardRequest(req, {
      action: "claim_gift",
      resourceId: `${id}:${giftId}`,
      requireHuman: gift.status === "issued",
      humanToken: body.humanToken,
    });
    return NextResponse.json(await redeemGift(id, giftId, key, body), {
      headers: privateHeaders,
    });
  } catch (error) {
    return organizationFailure(error);
  }
}
