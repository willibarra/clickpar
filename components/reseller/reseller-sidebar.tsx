'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Coins,
  PackagePlus,
  LogOut,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useState, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Coins2 = (Coins as any);

const navItems = [
  { href: '/reseller', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/reseller/stock', label: 'Mi Stock', icon: Package, exact: false },
  { href: '/reseller/ventas', label: 'Mis Ventas', icon: ShoppingCart, exact: false },
  { href: '/reseller/clientes', label: 'Mis Clientes', icon: Users, exact: false },
  { href: '/reseller/comisiones', label: 'Mis Comisiones', icon: Coins2, exact: false },
  { href: '/reseller/pedir-stock', label: 'Pedir Stock', icon: PackagePlus, exact: false },
];

interface ResellerSidebarProps {
  resellerName?: string;
}

export function ResellerSidebar({ resellerName }: ResellerSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [initials, setInitials] = useState('RS');

  useEffect(() => {
    if (resellerName) {
      const parts = resellerName.trim().split(' ');
      setInitials(parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : resellerName.slice(0, 2).toUpperCase()
      );
    }
  }, [resellerName]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/staff/login');
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-20 flex-col items-center border-r border-border bg-sidebar py-6">
      {/* Logo */}
      <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
        <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7 text-white" stroke="currentColor" strokeWidth="2">
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href) && !(item.exact && pathname !== item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200',
                isActive
                  ? 'text-white'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
              style={isActive ? { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' } : undefined}
            >
              <item.icon className="h-5 w-5" />
              {/* Tooltip */}
              <span className="absolute left-16 z-50 hidden rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md group-hover:block whitespace-nowrap">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* User Avatar & Logout */}
      <div className="mt-auto flex flex-col items-center gap-4">
        <button
          onClick={handleLogout}
          className="group relative flex h-12 w-12 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-red-500/20 hover:text-red-500"
        >
          <LogOut className="h-5 w-5" />
          <span className="absolute left-16 z-50 hidden rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md group-hover:block whitespace-nowrap">
            Cerrar sesión
          </span>
        </button>
        <Avatar className="h-10 w-10 border-2" style={{ borderColor: '#8b5cf6' }}>
          <AvatarImage src="/avatar.jpg" alt="Reseller" />
          <AvatarFallback style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: 'white' }}>{initials}</AvatarFallback>
        </Avatar>
      </div>
    </aside>
  );
}
