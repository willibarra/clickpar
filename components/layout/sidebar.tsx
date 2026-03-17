'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Package,
  Mail,
  CalendarClock,
  ShoppingCart,
  Users,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useEffect, useState } from 'react';

const allNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/sales', label: 'Ventas', icon: ShoppingCart, adminOnly: false },
  { href: '/inventory', label: 'Inventario', icon: Package, adminOnly: false },
  { href: '/renewals', label: 'Renovaciones', icon: CalendarClock, adminOnly: false },
  { href: '/customers', label: 'Clientes', icon: Users, adminOnly: false },
  { href: '/emails', label: 'Correos', icon: Mail, adminOnly: false },
  { href: '/finance', label: 'Finanzas', icon: Wallet, adminOnly: true },
  { href: '/statistics', label: 'Estadísticas', icon: BarChart3, adminOnly: true },
  { href: '/settings', label: 'Ajustes', icon: Settings, adminOnly: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userRole, setUserRole] = useState<string>('super_admin');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        (supabase.from('profiles') as any)
          .select('role')
          .eq('id', user.id)
          .single()
          .then(({ data }: any) => {
            if (data?.role) setUserRole(data.role);
          });
      }
    });
  }, [supabase]);

  const navItems = allNavItems.filter(item => {
    if (item.adminOnly && userRole !== 'super_admin') return false;
    return true;
  });

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/staff/login');
    router.refresh();
  };

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-20 flex-col items-center border-r border-border bg-sidebar py-6">
      {/* Logo */}
      <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-[#86EFAC]">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="h-7 w-7 text-black"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group relative flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200',
                isActive
                  ? 'bg-[#86EFAC] text-black'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <item.icon className="h-5 w-5" />
              {/* Tooltip */}
              <span className="absolute left-16 z-50 hidden rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md group-hover:block">
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
          <span className="absolute left-16 z-50 hidden rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md group-hover:block">
            Cerrar sesión
          </span>
        </button>
        <Avatar className="h-10 w-10 border-2 border-[#86EFAC]">
          <AvatarImage src="/avatar.jpg" alt="User" />
          <AvatarFallback className="bg-[#F97316] text-white">CP</AvatarFallback>
        </Avatar>
      </div>
    </aside>
  );
}

