'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Loader2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export function OmniSearch() {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [query, setQuery] = useState(searchParams.get('q') || '');
    const [resolving, setResolving] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);
    // Track the last query we actually navigated to, to avoid duplicate navigations
    const lastNavigatedQuery = useRef<string>(searchParams.get('q') || '');
    // Flag to prevent URL sync from overwriting user input while typing
    const isTyping = useRef(false);
    const typingTimeout = useRef<NodeJS.Timeout | null>(null);

    // Sync query from URL when navigating (but not while the user is actively typing)
    useEffect(() => {
        const urlQuery = searchParams.get('q') || '';
        if (!isTyping.current) {
            setQuery(urlQuery);
            lastNavigatedQuery.current = urlQuery;
        }
    }, [searchParams]);

    // Debounced navigation — only triggers after user stops typing
    const navigate = useCallback(async (value: string) => {
        const trimmed = value.trim();

        // Skip if this is the same query we already navigated to
        if (trimmed === lastNavigatedQuery.current) return;

        if (trimmed.length >= 2) {
            lastNavigatedQuery.current = trimmed;
            setResolving(true);

            try {
                // Ask the global search API where this query lives
                const res = await fetch(`/api/search/global?q=${encodeURIComponent(trimmed)}`);
                const data = await res.json();

                if (data.inventoryCount > 0) {
                    // Found in inventory — go there
                    router.replace(`/inventory?q=${encodeURIComponent(trimmed)}`);
                } else if (data.customersCount > 0) {
                    // NOT in inventory but IS in customers — redirect to customers
                    router.replace(`/customers?q=${encodeURIComponent(trimmed)}`);
                } else {
                    // Nothing found anywhere — still navigate to inventory (shows "no results")
                    router.replace(`/inventory?q=${encodeURIComponent(trimmed)}`);
                }
            } catch {
                // Fallback to inventory on error
                router.replace(`/inventory?q=${encodeURIComponent(trimmed)}`);
            } finally {
                setResolving(false);
            }
        } else if (trimmed.length === 0 && (pathname === '/inventory' || pathname === '/customers')) {
            lastNavigatedQuery.current = '';
            if (pathname === '/inventory') router.replace('/inventory');
            else router.replace('/customers');
        }
    }, [router, pathname]);

    const handleSearch = (value: string) => {
        setQuery(value);

        // Mark as typing to prevent URL sync from overwriting input
        isTyping.current = true;
        if (typingTimeout.current) clearTimeout(typingTimeout.current);
        typingTimeout.current = setTimeout(() => { isTyping.current = false; }, 1500);

        // Cancel any pending navigation
        if (debounceRef.current) clearTimeout(debounceRef.current);

        // 700ms debounce to let the user finish typing before API call
        debounceRef.current = setTimeout(() => navigate(value), 700);
    };

    const handleClear = () => {
        setQuery('');
        lastNavigatedQuery.current = '';
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (pathname.startsWith('/inventory')) router.replace('/inventory');
        else if (pathname.startsWith('/customers')) router.replace('/customers');
        inputRef.current?.focus();
    };

    // Submit on Enter — immediate navigation, no debounce
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (debounceRef.current) clearTimeout(debounceRef.current);
            navigate(query);
        }
    };

    // Keyboard shortcut ⌘K
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape' && document.activeElement === inputRef.current) {
                handleClear();
                inputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handleGlobalKeyDown);
        return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    return (
        <div className="relative w-full max-w-lg neon-search-wrapper">
            <div className="neon-search-inner">
                <div className="relative flex items-center">
                    {/* Search icon / spinner */}
                    <div className="absolute left-3 flex items-center pointer-events-none">
                        {resolving
                            ? <Loader2 className="h-4 w-4 animate-spin" style={{ color: '#a855f7' }} />
                            : <Search className="h-4 w-4" style={{ color: '#a855f7' }} />
                        }
                    </div>

                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar por teléfono, nombre, plataforma..."
                        value={query}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={handleKeyDown}
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
