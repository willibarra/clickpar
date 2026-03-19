'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
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
                router.push(`/?q=${encodeURIComponent(value.trim())}`);
            } else if (value.trim().length === 0 && pathname === '/') {
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
        <div className="relative w-full max-w-lg neon-search-wrapper">
            <div className="neon-search-inner">
                <div className="relative flex items-center">
                    {/* Search icon with gradient */}
                    <div className="absolute left-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4" style={{ color: '#a855f7' }} />
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar por teléfono, nombre, plataforma..."
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="
                            w-full bg-transparent
                            pl-10 pr-20 py-2.5
                            text-sm text-white placeholder:text-[#8b8ba7]
                            focus:outline-none
                            rounded-xl
                        "
                    />

                    <div className="absolute right-2 flex items-center gap-1.5">
                        {query && (
                            <button
                                onClick={handleClear}
                                className="rounded-lg p-1 text-[#8b8ba7] hover:text-white hover:bg-white/10 transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <kbd className="hidden sm:inline rounded-md px-2 py-1 text-[10px] font-medium text-[#8b8ba7]"
                            style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)' }}>
                            ⌘K
                        </kbd>
                    </div>
                </div>
            </div>
        </div>
    );
}
