import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-[100dvh] flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-8">
      <header className="mx-auto flex w-full max-w-md items-center justify-between py-2">
        <Brand />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">{children}</main>
    </div>
  );
}
