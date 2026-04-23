'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { OmniSearch } from './omnisearch';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { Menu } from 'lucide-react';
import { useSidebar } from '@/contexts/sidebar-context';

export function Header() {
    const { toggleMobile } = useSidebar();

    return (
        <header
            className="sticky top-0 z-30 flex h-14 md:h-16 items-center justify-between gap-3 px-3 md:px-6"
            style={{
                background: 'rgba(9,9,11,0.75)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(168,85,247,0.15)',
            }}
        >
            {/* Mobile hamburger */}
            <button
                onClick={toggleMobile}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
                aria-label="Abrir menú"
            >
                <Menu className="h-5 w-5" />
            </button>

            {/* OmniSearch */}
            <OmniSearch />

            {/* Right Section */}
            <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
                {/* Notification Bell */}
                <NotificationBell />

                {/* User Info — hidden on mobile (already in sidebar) */}
                <div className="hidden md:flex items-center gap-3">
                    <Avatar className="h-9 w-9 border border-border">
                        <AvatarFallback className="bg-[#F97316] text-white text-sm">A</AvatarFallback>
                    </Avatar>
                </div>
            </div>
        </header>
    );
}
