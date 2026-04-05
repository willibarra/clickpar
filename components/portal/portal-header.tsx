'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Tv, HelpCircle, LogOut, Zap, ShoppingBag, ArrowLeftRight, Wallet } from 'lucide-react';

const navItems = [
    { href: '/cliente', label: 'Servicios', icon: Tv },
    { href: '/cliente/tienda', label: 'Tienda', icon: ShoppingBag },
    { href: '/cliente/extracto', label: 'Extracto', icon: ArrowLeftRight },
    { href: '/cliente/soporte', label: 'Soporte', icon: HelpCircle },
];

export function PortalHeader({ userName, userRole }: { userName?: string; userRole?: string }) {
    const router = useRouter();
    const supabase = createClient();
    const [balance, setBalance] = useState<number | null>(null);

    useEffect(() => {
        fetch('/api/portal/wallet')
            .then((r) => r.json())
            .then((d) => {
                if (d.success) setBalance(d.balance);
            })
            .catch(() => {});
    }, []);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/cliente/login');
        router.refresh();
    };

    const formattedBalance = balance !== null
        ? `Gs. ${new Intl.NumberFormat('es-PY').format(balance)}`
        : null;

    return (
        <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
            <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-4">
                <Link href="/cliente" className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#86EFAC]">
                        <Zap className="h-5 w-5 text-black" />
                    </div>
                    <span className="text-lg font-bold text-foreground">ClickPar</span>
                </Link>
                <div className="flex items-center gap-3">
                    {/* Wallet balance badge */}
                    {formattedBalance !== null && (
                        <Link
                            href="/cliente/extracto"
                            className="flex items-center gap-1.5 rounded-xl border border-[#86EFAC]/30 bg-[#86EFAC]/10 px-3 py-1.5 text-xs font-semibold text-[#86EFAC] transition-colors hover:bg-[#86EFAC]/20"
                            title="Ver extracto de billetera"
                        >
                            <Wallet className="h-3.5 w-3.5" />
                            <span>{formattedBalance}</span>
                        </Link>
                    )}
                    {userName && (
                        <span className="hidden text-sm text-muted-foreground sm:block">
                            {userName}{userRole ? ` · ${userRole}` : ''}
                        </span>
                    )}
                    <button
                        onClick={handleLogout}
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title="Cerrar sesión"
                    >
                        <LogOut className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </header>
    );
}

export function PortalNav() {
    const pathname = usePathname();

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/95 backdrop-blur-xl sm:static sm:border-t-0 sm:border-b sm:border-border/50 sm:bg-transparent sm:backdrop-blur-none">
            <div className="mx-auto flex max-w-2xl items-center justify-around px-4 sm:justify-start sm:gap-1">
                {navItems.map((item) => {
                    const isActive = item.href === '/cliente'
                        ? pathname === '/cliente'
                        : pathname.startsWith(item.href);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-0.5 px-3 py-3 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:rounded-lg sm:px-4 sm:py-2 sm:text-sm ${isActive
                                ? 'text-[#86EFAC] sm:bg-[#86EFAC]/10'
                                : 'text-muted-foreground hover:text-foreground sm:hover:bg-muted/50'
                                }`}
                        >
                            <item.icon className={`h-5 w-5 sm:h-4 sm:w-4 ${isActive ? 'text-[#86EFAC]' : ''}`} />
                            {item.label}
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
