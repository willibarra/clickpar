'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Tv, HelpCircle, LogOut, Zap } from 'lucide-react';

const navItems = [
    { href: '/cliente', label: 'Servicios', icon: Tv },
    { href: '/cliente/soporte', label: 'Soporte', icon: HelpCircle },
];

export function PortalHeader({ userName, userRole }: { userName?: string; userRole?: string }) {
    const router = useRouter();
    const supabase = createClient();

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push('/cliente/login');
        router.refresh();
    };

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
                    {userName && (
                        <span className="text-sm text-muted-foreground">
                            {userName}{userRole ? ` - ${userRole}` : ''}
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
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex flex-col items-center gap-0.5 px-4 py-3 text-xs font-medium transition-colors sm:flex-row sm:gap-2 sm:rounded-lg sm:px-4 sm:py-2 sm:text-sm ${isActive
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
