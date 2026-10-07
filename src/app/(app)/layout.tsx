import { Plus } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/brand";
import { BottomTabBar, TopNavLinks } from "@/components/shell/nav-links";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { ButtonLink } from "@/components/ui/button";
import { auth } from "@/server/auth";

async function CurrentUser() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return <UserMenu name={session.user.name ?? null} email={session.user.email} />;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-4 sm:px-6">
          <Link href="/board" aria-label="Job Tracker home" className="rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
            <Brand />
          </Link>
          <TopNavLinks />
          <div className="ml-auto flex items-center gap-2">
            {/* Phones use the "New" tab in the bottom bar instead. */}
            <div className="hidden md:block">
              <ButtonLink href="/applications/new" size="sm">
                <Plus size={16} weight="bold" />
                New application
              </ButtonLink>
            </div>
            <ThemeToggle />
            <Suspense fallback={<span className="size-9 animate-pulse rounded-full bg-surface-hover" />}>
              <CurrentUser />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom,0px))] sm:px-6 md:pb-12">{children}</main>
      <BottomTabBar />
    </div>
  );
}
