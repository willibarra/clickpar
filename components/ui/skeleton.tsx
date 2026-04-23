import { cn } from '@/lib/utils';

function Skeleton({
    className,
    ...props
}: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted/50',
                className
            )}
            {...props}
        />
    );
}

/**
 * Dashboard page skeleton – shows a realistic loading state
 * that matches the mobile-first admin layout.
 */
function DashboardSkeleton() {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            {/* Page title */}
            <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-72" />
            </div>

            {/* Stats grid (matches the 2→5 responsive pattern) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 md:gap-3">
                {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
            </div>

            {/* Table / card area */}
            <Skeleton className="h-10 rounded-xl" />
            <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
            </div>
        </div>
    );
}

/**
 * Simple card list skeleton – for pages that show card-based content.
 */
function CardListSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className="space-y-4 animate-in fade-in duration-300">
            <div className="space-y-2">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="space-y-3">
                {Array.from({ length: count }).map((_, i) => (
                    <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
            </div>
        </div>
    );
}

export { Skeleton, DashboardSkeleton, CardListSkeleton };
