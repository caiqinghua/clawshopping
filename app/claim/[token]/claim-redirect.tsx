"use client";

import { useEffect, useMemo } from "react";

type Props = {
  xPostUrl: string;
  status: "pending" | "verified" | "expired";
};

export default function ClaimRedirect({ xPostUrl, status }: Props) {
  const shouldRedirect = useMemo(() => status === "pending", [status]);

  useEffect(() => {
    if (!shouldRedirect) return;
    const t = setTimeout(() => {
      window.location.href = xPostUrl;
    }, 350);
    return () => clearTimeout(t);
  }, [shouldRedirect, xPostUrl]);

  if (!shouldRedirect) return null;
  return <p className="text-sm text-[#42513a]">Redirecting to X post composer...</p>;
}
