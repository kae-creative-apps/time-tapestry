"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** Sample routes are explicitly identified; personal collections never claim simulated work. */
export function DemoBanner() {
  const pathname = usePathname();
  const [mock, setMock] = useState(false);
  const personalFlow =
    /^\/(?:record|collection|share|request|account)(?:\/|$)/.test(
      pathname ?? "",
    );

  useEffect(() => {
    if (personalFlow) return;
    let mounted = true;
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => {
        if (mounted) setMock(Boolean(data.mock));
      })
      .catch(() => {
        if (mounted) setMock(false);
      });
    return () => {
      mounted = false;
    };
  }, [personalFlow]);

  if (personalFlow || !mock) return null;
  return (
    <div className="w-full bg-oxblood px-4 py-3 text-center">
      <p className="font-sans text-sm font-medium text-paper">
        You are viewing a demonstration. Sample stories and delivery previews
        are illustrative.
      </p>
    </div>
  );
}
