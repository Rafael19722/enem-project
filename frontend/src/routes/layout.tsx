import { Outlet } from '@tanstack/react-router';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-4">
          <Logo />
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <Outlet />
      </main>

      <footer className="border-t py-5 text-center text-sm text-muted-foreground">
        Questões via{' '}
        <a
          href="https://api.enem.dev"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          api.enem.dev
        </a>
      </footer>
    </div>
  );
}
