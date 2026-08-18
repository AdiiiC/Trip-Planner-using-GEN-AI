"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Menu,
  Search,
  Route,
  Calculator,
  MapPinned,
  Plane,
  Building2,
  UtensilsCrossed,
  StampIcon,
  ChartNoAxesCombined,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

const primary = [
  { label: "Planner", href: "/planner", icon: Route, kbd: "P" },
  { label: "Budget", href: "/budget", icon: Calculator, kbd: "B" },
  { label: "Sightseeing", href: "/sightseeing", icon: MapPinned, kbd: "S" },
];

const secondary = [
  { label: "Trip Intelligence", href: "/intelligence", icon: ChartNoAxesCombined },
  { label: "Flights", href: "/flights", icon: Plane },
  { label: "Hotels", href: "/hotels", icon: Building2 },
  { label: "Restaurants", href: "/restaurants", icon: UtensilsCrossed },
  { label: "Visa", href: "/visa", icon: StampIcon },
];

export function Navbar() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openCommand = () => {
    // dispatch keyboard event to open the CommandPalette
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        scrolled
          ? "border-[var(--border)] bg-[color-mix(in_oklab,_var(--bg)_82%,_transparent)] backdrop-blur-xl"
          : "border-transparent bg-transparent"
      )}
      data-testid="app-navbar"
    >
      <div className="mx-auto max-w-7xl px-4 md:px-6 h-14 flex items-center gap-6">
        {/* Wordmark */}
        <Link
          href="/"
          className="flex items-center gap-2 shrink-0 group"
          data-testid="brand-home-link"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] group-hover:border-[var(--accent-ring)] transition-colors">
            <Compass
              className="h-4 w-4 text-[var(--accent-hover)]"
              strokeWidth={1.5}
            />
          </span>
          <span className="font-display text-2xl leading-none tracking-tight">
            Wayfare
          </span>
          <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] uppercase tracking-[0.12em]">Beta</Badge>
        </Link>

        {/* Desktop primary nav */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {primary.map(({ label, href, icon: Icon }) => {
            const active = path === href || path.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                data-testid={`nav-${label.toLowerCase()}`}
                className={cn(
                  "relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5",
                  active
                    ? "text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]"
                )}
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.75} />
                {label}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-[13px] h-px bg-[var(--accent)]"
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}

          {/* More dropdown for secondary items */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                data-testid="nav-more"
                className="px-3 py-1.5 rounded-md text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors focus:outline-none"
              >
                More
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Extras</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {secondary.map(({ label, href, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild>
                  <Link href={href} className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-[var(--fg-muted)]" strokeWidth={1.75} />
                    {label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right cluster */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={openCommand}
            data-testid="nav-command-trigger"
            className="hidden md:flex items-center gap-2 h-8 rounded-md border border-[var(--border)] bg-[var(--surface-2)] pl-2.5 pr-1.5 text-xs text-[var(--fg-muted)] hover:border-[var(--border-strong)] hover:text-[var(--fg)] transition-colors"
          >
            <Search className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="hidden lg:inline">Quick search…</span>
            <kbd className="ml-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--fg-dim)]">
              ⌘K
            </kbd>
          </button>

          <ThemeToggle />

          <AuthNavButton />

          <Button asChild size="sm" className="hidden sm:inline-flex" data-testid="nav-cta-plan">
            <Link href="/planner">Plan a trip</Link>
          </Button>

          <button
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--fg-muted)]"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
            data-testid="mobile-menu-toggle"
          >
            <Menu className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Mobile */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg)]" data-testid="mobile-menu">
          <nav className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-1">
            {[...primary, ...secondary].map(({ label, href, icon: Icon }) => {
              const active = path === href;
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-[var(--surface-2)] text-[var(--fg)]"
                      : "text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-2)]"
                  )}
                >
                  <Icon className="w-4 h-4" strokeWidth={1.75} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}

function AuthNavButton() {
  const { user, status } = useAuth();
  if (status === "loading") return null;
  // Accounts that haven't picked a handle fall back to the email's local part —
  // never the full address.
  const label = user ? (user.username ? `@${user.username}` : user.display_name) : "Log in";
  return (
    <Link
      href="/account"
      data-testid="nav-account"
      className="hidden sm:inline-flex items-center gap-1.5 h-8 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 text-xs font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-colors max-w-[160px]"
      title={user ? `${label} — account settings` : "Log in"}
    >
      {user && (
        <span className="w-4 h-4 shrink-0 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold flex items-center justify-center">
          {user.display_name.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="truncate">{label}</span>
    </Link>
  );
}
