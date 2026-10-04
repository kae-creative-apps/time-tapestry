import Link from "next/link";
import { BrandArtwork } from "./BrandArtwork";

type LogoVariant = "mark" | "full" | "light" | "dark";
export function BrandLockup({ variant = "full", className = "" }: { variant?: LogoVariant; className?: string }) {
  const markOnly = variant === "mark";
  return <span role="img" aria-label="Time Tapestry" className={`inline-flex shrink-0 items-center ${variant === "light" ? "text-paper" : variant === "dark" ? "rounded-xl bg-espresso p-5 text-paper" : "text-espresso"} ${className}`}>
    <BrandArtwork variant={markOnly ? "mark" : "lockup"} className={markOnly ? "h-9 w-auto" : "h-14 w-auto max-w-full"} />
  </span>;
}
export function Logo({ variant = "full", className = "", href = "/" }: { variant?: LogoVariant; className?: string; href?: string }) {
  return <Link href={href} aria-label="Time Tapestry home" className={`inline-flex shrink-0 items-center ${className}`}><BrandLockup variant={variant} /></Link>;
}
