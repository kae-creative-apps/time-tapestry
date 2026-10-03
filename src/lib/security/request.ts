import type { NextRequest } from "next/server";
import {
  assertOrigin,
  localSecurityBypass,
  limits,
  paidActions,
  requireSecurityConfiguration,
  type SecurityAction,
} from "./policy";
import { clientBucket, consumeLimit } from "./rate-limit";
import { verifyHuman } from "./human";
export { SecurityError } from "./policy";

export async function guardRequest(
  req: NextRequest,
  options: {
    action: SecurityAction;
    resourceId?: string;
    humanToken?: unknown;
    requireHuman?: boolean;
  },
) {
  assertOrigin(req);
  requireSecurityConfiguration(req);
  // Only explicit automated test fixtures may bypass counters. Hosted requests cannot.
  if (
    process.env.NODE_ENV === "test" &&
    process.env.SECURITY_TEST_BYPASS === "true" &&
    localSecurityBypass(req)
  )
    return;
  const policy = limits[options.action];
  const client = clientBucket(req);
  await consumeLimit(
    `${options.action}:client:${client}`,
    Math.max(
      policy.count,
      options.resourceId ? policy.count * 3 : policy.count,
    ),
    policy.seconds,
  );
  if (options.resourceId)
    await consumeLimit(
      `${options.action}:resource:${options.resourceId}`,
      policy.count,
      policy.seconds,
    );
  if (paidActions.has(options.action)) {
    const value = Number(process.env.SECURITY_PROVIDER_DAILY_LIMIT || 500);
    const daily = Number.isSafeInteger(value) && value > 0 ? value : 500;
    await consumeLimit("all-provider-actions:daily", daily, 86400);
  }
  if (options.requireHuman)
    await verifyHuman(req, options.humanToken, options.action);
}
