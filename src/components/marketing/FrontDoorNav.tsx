"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { AppIcon } from "@/components/icons";
import styles from "./FrontDoor.module.css";

const links = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#postcards", label: "The postcards" },
  { href: "/for-organizations", label: "For organizations" },
];

export function FrontDoorNav() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  return (
    <header
      className={styles.header}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          toggleRef.current?.focus();
        }
      }}
    >
      <div className={styles.navBar}>
        <Logo className={styles.logo} />
        <nav className={styles.desktopNav} aria-label="Main navigation">
          {links.map((link) => (
            <Link href={link.href} key={link.href}>
              {link.label}
            </Link>
          ))}
        </nav>
        <div className={styles.navActions}>
          <Link href="/account" className={styles.accountLink}>
            Donor sign-in
          </Link>
          <Link href="/for-organizations#invite-donors" className={styles.navStart}>
            Invite your donors <AppIcon name="arrowUpRight" size={18} />
          </Link>
        </div>
        <button
          ref={toggleRef}
          type="button"
          className={styles.menuToggle}
          aria-expanded={open}
          aria-controls="front-door-mobile-nav"
          aria-label={open ? "Close navigation" : "Open navigation"}
          onClick={() => setOpen(!open)}
        >
          {open ? (
            <X size={24} aria-hidden="true" />
          ) : (
            <Menu size={24} aria-hidden="true" />
          )}
        </button>
      </div>
      {open && (
        <nav
          id="front-door-mobile-nav"
          className={styles.mobileNav}
          aria-label="Mobile navigation"
        >
          {links.map((link) => (
            <Link
              href={link.href}
              key={link.href}
              onClick={() => setOpen(false)}
            >
              {link.label}
              <AppIcon name="arrowUpRight" size={18} />
            </Link>
          ))}
          <Link href="/account" onClick={() => setOpen(false)}>
            Donor sign-in <AppIcon name="arrowUpRight" size={18} />
          </Link>
          <Link
            href="/for-organizations#invite-donors"
            className={styles.mobileStart}
            onClick={() => setOpen(false)}
          >
            Invite your donors <AppIcon name="arrowUpRight" size={18} />
          </Link>
        </nav>
      )}
    </header>
  );
}
