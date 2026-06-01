"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  PiggyBank,
  Repeat,
  Settings,
  Sparkles,
  Tags,
  Terminal,
  TrendingUp,
  Wallet,
  Hash,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
}

const mainNav: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Transaksi", href: "/dashboard/transactions", icon: CreditCard },
  { title: "Kategori", href: "/dashboard/categories", icon: Tags },
  { title: "Tag", href: "/dashboard/tags", icon: Hash },
  { title: "Metode Bayar", href: "/dashboard/payment-methods", icon: Wallet },
  { title: "Budget", href: "/dashboard/budgets", icon: PiggyBank },
  {
    title: "Tagihan Berkala",
    href: "/dashboard/recurring-bills",
    icon: Repeat,
  },
  { title: "AI Insights", href: "/dashboard/insights", icon: Sparkles },
];

const bottomNav: NavItem[] = [
  { title: "System Logs", href: "/dashboard/system", icon: Terminal },
  { title: "Pengaturan", href: "/dashboard/settings", icon: Settings },
];

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const link = (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
        collapsed && "justify-center px-2",
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span>{item.title}</span>}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{item.title}</TooltipContent>
      </Tooltip>
    );
  }
  return link;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-md lg:px-6">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-bold text-emerald-500"
        >
          <TrendingUp className="h-5 w-5" />
          <span className={cn("text-lg", collapsed && "lg:hidden")}>
            FinCore
          </span>
        </Link>
        <div className="flex-1" />
        <nav className="flex items-center gap-1">
          <Link
            href="/api/auth/logout"
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all h-7 hover:bg-muted hover:text-foreground px-2.5"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </Link>
        </nav>
      </header>

      <div className="flex flex-1">
        {/* Sidebar - Desktop */}
        <aside
          className={cn(
            "hidden border-r bg-card lg:flex lg:flex-col transition-all duration-200",
            collapsed ? "lg:w-16" : "lg:w-60",
          )}
        >
          <div className="flex flex-1 flex-col gap-1 p-2">
            {mainNav.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/dashboard" && pathname.startsWith(item.href));
              return (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                />
              );
            })}
          </div>

          <Separator />

          <div className="flex flex-col gap-1 p-2">
            {bottomNav.map((item) => {
              const isActive = pathname === item.href;
              return (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                />
              );
            })}

            <ThemeToggle collapsed={collapsed} />

            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "mt-1 text-muted-foreground",
                collapsed && "justify-center px-2",
              )}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4" />
                  <span>Collapse</span>
                </>
              )}
            </Button>
          </div>
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <aside
              className="h-full w-64 border-r bg-card p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-500" />
                <span className="text-lg font-bold text-emerald-500">
                  FinCore
                </span>
              </div>
              <nav className="flex flex-col gap-1">
                {[...mainNav, ...bottomNav].map((item) => {
                  const isActive =
                    pathname === item.href ||
                    (item.href !== "/dashboard" &&
                      pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  );
                })}
                <div className="px-1 mt-2">
                  <ThemeToggle />
                </div>
              </nav>
              <Separator className="my-4" />
              <Link
                href="/api/auth/logout"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all h-7 hover:bg-muted hover:text-foreground px-2.5 w-full text-destructive"
              >
                <LogOut className="size-3.5" />
                Keluar
              </Link>
            </aside>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
