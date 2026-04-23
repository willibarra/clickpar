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
  Zap,
  Store,
  Inbox,
  TicketCheck,
  Truck,
  Bot,
  ShieldCheck,
  MessageSquare,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useEffect, useState } from 'react';
import { useSidebar } from '@/contexts/sidebar-context';

const allNavItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { href: '/sales', label: 'Ventas', icon: ShoppingCart, adminOnly: false },
  { href: '/inventory', label: 'Inventario', icon: Package, adminOnly: false },
  { href: '/renewals', label: 'Renovaciones', icon: CalendarClock, adminOnly: false },
  { href: '/customers', label: 'Clientes', icon: Users, adminOnly: false },
  { href: '/tickets', label: 'Tickets', icon: TicketCheck, adminOnly: false },
  { href: '/conversaciones', label: 'Conversaciones', icon: MessageSquare, adminOnly: false },
  { href: '/code-requests', label: 'Códigos', icon: ShieldCheck, adminOnly: false },
  { href: '/emails', label: 'Correos', icon: Mail, adminOnly: false },
  { href: '/finance', label: 'Finanzas', icon: Wallet, adminOnly: true },
  { href: '/statistics', label: 'Estadísticas', icon: BarChart3, adminOnly: true },
  { href: '/automatizaciones', label: 'Automatizaciones', icon: Zap, adminOnly: true },
  { href: '/chatbot', label: 'Chatbot IA', icon: Bot, adminOnly: true },
  { href: '/proveedores', label: 'Proveedores', icon: Truck, adminOnly: true },
  { href: '/resellers', label: 'Revendedores', icon: Store, adminOnly: true },
  { href: '/stock-requests', label: 'Solicitudes Stock', icon: Inbox, adminOnly: true },
  { href: '/settings', label: 'Configuración', icon: Settings, adminOnly: true },
];

// Collapsed width in pixels
const COLLAPSED_W = 72;
// Expanded width in pixels
const EXPANDED_W = 240;

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [userRole, setUserRole] = useState<string>('super_admin');
  const [hovered, setHovered] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { mobileOpen, setMobileOpen } = useSidebar();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Close mobile drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileOpen) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileOpen, setMobileOpen]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

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

  // Prevent hydration flicker
  if (!mounted) {
    return (
      <div className="hidden md:block" style={{ width: COLLAPSED_W, flexShrink: 0 }} aria-hidden="true" />
    );
  }

  // On mobile the drawer is always "expanded" (full-width labels visible)
  const expanded = hovered || mobileOpen;

  /* ── Shared sidebar content ── */
  const sidebarContent = (
    <>
      {/* Logo row */}
      <div
        className={cn(
          'flex items-center px-3 mb-6',
          expanded ? 'justify-start' : 'justify-center'
        )}
      >
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#86EFAC]">
          <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-black" stroke="currentColor" strokeWidth="2">
            <path d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>

        <span
          style={{
            opacity: expanded ? 1 : 0,
            width: expanded ? 'auto' : 0,
            marginLeft: expanded ? '12px' : 0,
            transition: 'opacity 200ms ease, margin 280ms ease',
            overflow: 'hidden',
          }}
          className="whitespace-nowrap text-sm font-semibold tracking-wide text-foreground"
        >
          ClickPar
        </span>

        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors md:hidden"
          aria-label="Cerrar menú"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Divider */}
      <div className="mx-3 mb-4 h-px bg-border/60" />

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-2 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex h-11 items-center gap-3 rounded-xl px-3 select-none',
                'transition-colors duration-150',
                isActive
                  ? 'bg-[#86EFAC]/15 text-[#86EFAC]'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#86EFAC]" />
              )}

              <item.icon
                className={cn(
                  'h-[18px] w-[18px] flex-shrink-0',
                  isActive ? 'text-[#86EFAC]' : ''
                )}
              />

              <span
                style={{
                  opacity: expanded ? 1 : 0,
                  maxWidth: expanded ? '160px' : 0,
                  transition: 'opacity 180ms ease, max-width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
                  overflow: 'hidden',
                }}
                className="whitespace-nowrap text-sm font-medium"
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-3 h-px bg-border/60" />

      {/* User section */}
      <div className="flex flex-col gap-1 px-2">
        <button
          onClick={handleLogout}
          className={cn(
            'relative flex h-11 w-full items-center gap-3 rounded-xl px-3',
            'text-muted-foreground transition-colors hover:bg-red-500/15 hover:text-red-400'
          )}
        >
          <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
          <span
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '160px' : 0,
              transition: 'opacity 180ms ease, max-width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}
            className="whitespace-nowrap text-sm font-medium"
          >
            Cerrar sesión
          </span>
        </button>

        <div
          className={cn(
            'flex items-center gap-3 rounded-xl px-3 py-2',
            !expanded && 'justify-center'
          )}
        >
          <Avatar className="h-8 w-8 flex-shrink-0 border-2 border-[#86EFAC]/50">
            <AvatarFallback className="bg-[#F97316] text-white text-xs">CP</AvatarFallback>
          </Avatar>

          <div
            style={{
              opacity: expanded ? 1 : 0,
              maxWidth: expanded ? '140px' : 0,
              transition: 'opacity 180ms ease, max-width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
              overflow: 'hidden',
            }}
            className="flex flex-col min-w-0"
          >
            <span className="truncate text-xs font-semibold text-foreground">Admin</span>
            <span className="truncate text-[11px] text-muted-foreground">ClickPar</span>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ── MOBILE: Backdrop overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── MOBILE: Slide-in drawer ── */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen flex-col border-r border-border bg-sidebar py-5 overflow-hidden md:hidden',
          'transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ width: EXPANDED_W }}
      >
        {sidebarContent}
      </aside>

      {/* ── DESKTOP: Hover-expand sidebar ── */}
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: hovered ? EXPANDED_W : COLLAPSED_W,
          transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        className="fixed left-0 top-0 z-40 hidden md:flex h-screen flex-col border-r border-border bg-sidebar py-5 overflow-hidden"
      >
        {sidebarContent}
      </aside>

      {/* Static spacer — only on desktop */}
      <div className="hidden md:block" style={{ width: COLLAPSED_W, flexShrink: 0 }} aria-hidden="true" />
    </>
  );
}
