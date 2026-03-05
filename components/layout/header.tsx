'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { OmniSearch } from './omnisearch';
import { NotificationBell } from '@/components/notifications/notification-bell';

export function Header() {
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
                    <Avatar className="h-9 w-9 border border-border">
                        <AvatarImage src="/avatar.jpg" alt="Admin" />
                        <AvatarFallback className="bg-[#F97316] text-white text-sm">A</AvatarFallback>
                    </Avatar>
                </div>
            </div>
        </header>
    );
}
