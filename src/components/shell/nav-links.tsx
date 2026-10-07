"use client";

import { Kanban, ListBullets, Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/board", label: "Board", Icon: Kanban },
  { href: "/applications", label: "Applications", Icon: ListBullets },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/applications") return pathname === href || /^\/applications\/(?!new)[^/]+/.test(pathname);
  return pathname.startsWith(href);
}

// The current URL is request data, so the active highlight streams in behind Suspense;
// the fallback is the same nav with nothing highlighted.
export function TopNavLinks() {
  return (
    <Suspense fallback={<TopNav pathname="" />}>
      <TopNavWithPath />
    </Suspense>
  );
}

function TopNavWithPath() {
  return <TopNav pathname={usePathname()} />;
}

function TopNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {LINKS.map(({ href, label }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-surface-hover text-text" : "text-muted hover:bg-surface-hover hover:text-text"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone navigation pinned to the bottom of the screen, clear of the home indicator. */
export function BottomTabBar() {
  return (
    <Suspense fallback={<BottomTabs pathname="" />}>
      <BottomTabsWithPath />
    </Suspense>
  );
}

function BottomTabsWithPath() {
  return <BottomTabs pathname={usePathname()} />;
}

function BottomTabs({ pathname }: { pathname: string }) {
  const tabs = [...LINKS, { href: "/applications/new", label: "New", Icon: Plus }] as const;
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-3">
        {tabs.map(({ href, label, Icon }) => {
          const active = href === "/applications/new" ? pathname === href : isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition ${
                  active ? "text-primary-text" : "text-muted"
                }`}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
