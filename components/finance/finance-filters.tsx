'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

export function FinanceFilters() {
    const router = useRouter();
    const params = useSearchParams();

    // Parse current month from ?month=YYYY-MM, default: today
    const now = new Date();
    const raw = params.get('month'); // "YYYY-MM"
    const [year, month] = raw
        ? [parseInt(raw.split('-')[0]), parseInt(raw.split('-')[1]) - 1]
        : [now.getFullYear(), now.getMonth()];

    const current = new Date(year, month, 1);

    const navigate = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        router.push(`?month=${y}-${m}`);
    };

    const prev = () => {
        const d = new Date(current);
        d.setMonth(d.getMonth() - 1);
        navigate(d);
    };

    const next = () => {
        const d = new Date(current);
        d.setMonth(d.getMonth() + 1);
        navigate(d);
    };

    const goToday = () => {
        router.push('?');
    };

    const label = current.toLocaleDateString('es-PY', { month: 'long', year: 'numeric' });
    const isCurrentMonth = current.getFullYear() === now.getFullYear() && current.getMonth() === now.getMonth();

    return (
        <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prev} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-2 min-w-[160px] justify-center">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium capitalize">{label}</span>
            </div>

            <Button variant="outline" size="icon" onClick={next} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
            </Button>

            {!isCurrentMonth && (
                <Button variant="ghost" size="sm" onClick={goToday} className="text-xs h-8 text-muted-foreground">
                    Hoy
                </Button>
            )}
        </div>
    );
}
