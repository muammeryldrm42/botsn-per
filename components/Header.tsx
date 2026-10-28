"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Canlı" },
  { href: "/gecmis", label: "Geçmiş" },
  { href: "/yontem", label: "Yöntem" },
];

export function Header() {
  const pathname = usePathname();
  return (
    <header className="top">
      <div className="shell top-row">
        <Link href="/" className="brand">
          <span className="mark">PER</span>
          <span>
            <strong>PER</strong>
            <span>Solana çağrı masası</span>
          </span>
        </Link>
        <nav className="nav" aria-label="Sayfalar">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} data-active={active}>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
