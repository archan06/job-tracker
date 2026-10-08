"use client";

import { EnvelopeSimple, Kanban, ListBullets, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

const LINKS = [
  { href: "/board", label: "Board", Icon: Kanban },
  { href: "/applications", label: "Applications", Icon: ListBullets },
  { href: "/email", label: "Email", Icon: EnvelopeSimple },
] as const;

/** Per-link badges rendered on the server (e.g. emails waiting for review). */
type Badges = Partial<Record<(typeof LINKS)[number]["href"], ReactNode>>;

function isActive(pathname: string, href: string) {
  if (href === "/applications") return pathname === href || /^\/applications\/(?!new)[^/]+/.test(pathname);
  return pathname.startsWith(href);
}

// The current URL is request data, so the active highlight streams in behind Suspense;
// the fallback is the same nav with nothing highlighted.
export function TopNavLinks({ badges = {} }: { badges?: Badges }) {
  return (
    <Suspense fallback={<TopNav pathname="" badges={badges} />}>
      <TopNavWithPath badges={badges} />
    </Suspense>
  );
}

function TopNavWithPath({ badges }: { badges: Badges }) {
  return <TopNav pathname={usePathname()} badges={badges} />;
}

function TopNav({ pathname, badges }: { pathname: string; badges: Badges }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-surface-hover text-text" : "text-muted hover:bg-surface-hover hover:text-text"
            }`}
          >
            {label}
            {badges[href]}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone navigation pinned to the bottom of the screen, clear of the home indicator. */
export function BottomTabBar({ badges = {} }: { badges?: Badges }) {
  return (
    <Suspense fallback={<BottomTabs pathname="" badges={badges} />}>
      <BottomTabsWithPath badges={badges} />
    </Suspense>
  );
}

function BottomTabsWithPath({ badges }: { badges: Badges }) {
  return <BottomTabs pathname={usePathname()} badges={badges} />;
}

function BottomTabs({ pathname, badges }: { pathname: string; badges: Badges }) {
  const tabs = [...LINKS, { href: "/applications/new", label: "New", Icon: Plus }] as const;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-4">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/applications/new" ? pathname === href : isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  active ? "text-primary-text" : "text-muted"
                }`}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {href in badges && <span className="absolute top-1 left-1/2 ml-2">{badges[href as keyof Badges]}</span>}
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
