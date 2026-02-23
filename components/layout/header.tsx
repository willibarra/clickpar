'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OmniSearch } from './omnisearch';
import { NotificationBell } from '@/components/notifications/notification-bell';

export function Header() {
    const currentHour = new Date().getHours();
    let greeting = 'Buenos días';
    if (currentHour >= 12 && currentHour < 18) {
        greeting = 'Buenas tardes';
    } else if (currentHour >= 18 || currentHour < 6) {
        greeting = 'Buenas noches';
    }

    return (
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
            {/* OmniSearch */}
            <OmniSearch />

            {/* Right Section */}
            <div className="flex items-center gap-4">
                {/* Notification Bell */}
                <NotificationBell />

                {/* User Info */}
                <div className="flex items-center gap-3">
                    <div className="hidden text-right sm:block">
                        <p className="text-sm font-medium text-foreground">{greeting}, Admin</p>
                    </div>
                    <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src="/avatar.jpg" alt="Admin" />
                        <AvatarFallback className="bg-[#F97316] text-white text-sm">A</AvatarFallback>
                    </Avatar>
                </div>
            </div>
        </header>
    );
}
