'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function OmniSearch() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Sync query from URL when navigating
    useEffect(() => {
        const urlQuery = searchParams.get('q') || '';
        setQuery(urlQuery);
    }, [searchParams]);

    // Debounced navigation to dashboard with search param
    const handleSearch = (value: string) => {
        setQuery(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);

        debounceRef.current = setTimeout(() => {
            if (value.trim().length >= 2) {
                // Always navigate to dashboard with search query
                router.push(`/?q=${encodeURIComponent(value.trim())}`);
            } else if (value.trim().length === 0 && pathname === '/') {
                // Clear search — go back to clean dashboard
                router.push('/');
            }
        }, 300);
    };

    const handleClear = () => {
        setQuery('');
        router.push('/');
        inputRef.current?.focus();
    };

    // Keyboard shortcut ⌘K
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === inputRef.current) {
                handleClear();
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <div className="relative w-full max-w-lg">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    ref={inputRef}
                    type="text"
                    placeholder="Buscar por teléfono, nombre, plataforma, proveedor..."
                    value={query}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="w-full bg-[#1a1a1a] pl-10 pr-20"
                />
                <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                    {query && (
                        <button onClick={handleClear} className="rounded p-1 hover:bg-[#333]">
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    )}
                    <kbd className="hidden rounded bg-[#333] px-1.5 py-0.5 text-xs text-muted-foreground sm:inline">
                        ⌘K
                    </kbd>
                </div>
            </div>
        </div>
    );
}
