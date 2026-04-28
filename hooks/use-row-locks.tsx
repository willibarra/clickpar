'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface RowLock {
    saleId: string;
    userId: string;
    userName: string;
}

interface UseRowLocksReturn {
    /** Map of saleId → lock info */
    locks: Map<string, RowLock>;
    /** Lock a row (claim it for editing). Returns true if acquired. */
    lockRow: (saleId: string) => boolean;
    /** Unlock a row (release it) */
    unlockRow: (saleId: string) => void;
    /** Check if a row is locked by someone else */
    isLockedByOther: (saleId: string) => boolean;
    /** Get lock info for a row (null if not locked) */
    getLock: (saleId: string) => RowLock | null;
    /** Current user ID */
    currentUserId: string | null;
    /** Broadcast a data-changed signal so other clients refresh */
    broadcastRefresh: (saleId?: string) => void;
    /** Set of saleIds recently updated by OTHER users (for flash animation) */
    recentlyUpdated: Set<string>;
}

const CHANNEL_NAME = 'renewals-row-locks';

/**
 * useRowLocks — Collaborative row-locking using Supabase Presence.
 *
 * WHY PRESENCE (not Broadcast):
 *   - Broadcast is fire-and-forget: if two users click the same row within
 *     the network round-trip window (~50-200ms), both acquire the lock locally
 *     before either receives the other's broadcast → RACE CONDITION.
 *   - Presence is a server-managed CRDT. The server maintains a single source
 *     of truth for all users' tracked state. When user A and user B both track
 *     the same row, the `sync` event delivers a merged state where we can
 *     deterministically resolve the conflict (lower userId wins).
 *   - New joiners get the full presence state immediately on subscribe
 *     (via `presence_state`), so there's no "cold start" latency.
 *   - Presence auto-cleans when a user disconnects (tab close, network loss),
 *     so stale locks never persist.
 *   - No manual heartbeat needed — Presence handles keep-alive internally.
 *
 * Broadcast is still used for the `data-changed` event (refresh signal).
 */
export function useRowLocks(): UseRowLocksReturn {
    // Memoize client so it's stable across renders
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();

    const [locks, setLocks] = useState<Map<string, RowLock>>(new Map());
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [currentUserName, setCurrentUserName] = useState<string>('Staff');
    const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const myLocksRef = useRef<Set<string>>(new Set());
    // Synchronous mirror of locks for instant checks (avoids React state batch delay)
    const locksRef = useRef<Map<string, RowLock>>(new Map());
    // Track current userId/userName in refs for use in callbacks without stale closures
    const userIdRef = useRef<string | null>(null);
    const userNameRef = useRef<string>('Staff');
    // Debounce timer for presence track calls
    const trackDebounceRef = useRef<NodeJS.Timeout | null>(null);

    // Initialize user info
    useEffect(() => {
        async function init() {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            setCurrentUserId(user.id);
            userIdRef.current = user.id;

            const { data: profile } = await supabase
                .from('profiles')
                .select('full_name')
                .eq('id', user.id)
                .single();

            const name = (profile as any)?.full_name || user.email?.split('@')[0] || 'Staff';
            setCurrentUserName(name);
            userNameRef.current = name;
        }
        init();
    }, [supabase]);

    // Set up the Realtime Presence channel
    useEffect(() => {
        if (!currentUserId) return;

        const channel = supabase.channel(CHANNEL_NAME, {
            config: {
                presence: { key: currentUserId },
            },
        });

        channel
            .on('presence', { event: 'sync' }, () => {
                const presenceState = channel.presenceState();
                const newLocks = new Map<string, RowLock>();

                // Build the global locks map from all users' presence
                for (const [presenceKey, presences] of Object.entries(presenceState)) {
                    for (const p of presences as any[]) {
                        const lockedRows: string[] = p.locked_rows || [];
                        const userId = p.user_id as string;
                        const userName = p.user_name as string;

                        for (const saleId of lockedRows) {
                            const existing = newLocks.get(saleId);
                            if (!existing) {
                                // First claim — accept it
                                newLocks.set(saleId, { saleId, userId, userName });
                            } else {
                                // CONFLICT: two users claim the same row
                                // Deterministic resolution: lower userId wins
                                if (userId < existing.userId) {
                                    newLocks.set(saleId, { saleId, userId, userName });
                                }
                            }
                        }
                    }
                }

                // Update both ref and state atomically
                locksRef.current = newLocks;
                setLocks(newLocks);

                // Check if any of MY locks were overridden (I lost the race)
                let myLocksChanged = false;
                for (const saleId of myLocksRef.current) {
                    const lock = newLocks.get(saleId);
                    if (lock && lock.userId !== currentUserId) {
                        // I lost this lock — remove it from my tracked set
                        myLocksRef.current.delete(saleId);
                        myLocksChanged = true;
                    }
                }
                if (myLocksChanged) {
                    // Re-track with updated locked_rows
                    channel.track({
                        user_id: currentUserId,
                        user_name: userNameRef.current,
                        locked_rows: [...myLocksRef.current],
                    });
                }
            })
            .on('broadcast', { event: 'data-changed' }, (payload: any) => {
                // Track which row was updated for flash animation
                const changedSaleId = payload?.payload?.saleId;
                if (changedSaleId) {
                    setRecentlyUpdated(prev => {
                        const next = new Set(prev);
                        next.add(changedSaleId);
                        return next;
                    });
                    // Auto-clear the highlight after 4 seconds
                    setTimeout(() => {
                        setRecentlyUpdated(prev => {
                            const next = new Set(prev);
                            next.delete(changedSaleId);
                            return next;
                        });
                    }, 4000);
                }
                // Refresh data from server (slight delay to let animation class apply first)
                setTimeout(() => router.refresh(), 100);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('🔒 Presence: suscrito al canal de row locks');
                    // Track initial presence (no locked rows)
                    await channel.track({
                        user_id: currentUserId,
                        user_name: userNameRef.current,
                        locked_rows: [],
                    });
                }
            });

        channelRef.current = channel;

        return () => {
            // Clean up: untrack removes our presence automatically
            myLocksRef.current.clear();
            supabase.removeChannel(channel);
        };
    }, [currentUserId, supabase, router]);

    // Helper: update my presence with current locked rows (debounced to batch rapid changes)
    const trackMyLocks = useCallback(() => {
        if (trackDebounceRef.current) clearTimeout(trackDebounceRef.current);
        trackDebounceRef.current = setTimeout(() => {
            const channel = channelRef.current;
            const userId = userIdRef.current;
            if (!channel || !userId) return;

            channel.track({
                user_id: userId,
                user_name: userNameRef.current,
                locked_rows: [...myLocksRef.current],
            });
        }, 50); // 50ms debounce — batches rapid lock/unlock operations
    }, []);

    /**
     * lockRow — Attempt to acquire a lock on a row.
     * Returns true if the lock was acquired (or already held by me).
     * Returns false if the row is locked by another user.
     */
    const lockRow = useCallback((saleId: string): boolean => {
        const userId = userIdRef.current;
        if (!channelRef.current || !userId) return false;

        // Already locked by me → no-op, success
        if (myLocksRef.current.has(saleId)) return true;

        // Check synchronous ref for immediate conflict detection
        const existingLock = locksRef.current.get(saleId);
        if (existingLock && existingLock.userId !== userId) {
            return false; // Blocked by another user
        }

        // Acquire the lock
        myLocksRef.current.add(saleId);

        // Optimistic local update (immediate visual feedback)
        const newLock: RowLock = { saleId, userId, userName: userNameRef.current };
        locksRef.current.set(saleId, newLock);
        setLocks(prev => {
            const next = new Map(prev);
            next.set(saleId, newLock);
            return next;
        });

        // Broadcast presence update → synced to all other clients
        trackMyLocks();

        return true;
    }, [trackMyLocks]);

    /**
     * unlockRow — Release a lock on a row.
     */
    const unlockRow = useCallback((saleId: string) => {
        const userId = userIdRef.current;
        if (!channelRef.current || !userId) return;

        // Only unlock if I hold it
        if (!myLocksRef.current.has(saleId)) return;

        myLocksRef.current.delete(saleId);

        // Optimistic local update
        locksRef.current.delete(saleId);
        setLocks(prev => {
            const next = new Map(prev);
            next.delete(saleId);
            return next;
        });

        // Broadcast presence update → synced to all other clients
        trackMyLocks();
    }, [trackMyLocks]);

    /**
     * isLockedByOther — Check if a row is locked by someone else.
     * Uses the synchronous ref for instant results (no React batch delay).
     */
    const isLockedByOther = useCallback((saleId: string): boolean => {
        const userId = userIdRef.current;
        const lock = locksRef.current.get(saleId);
        if (!lock) return false;
        return lock.userId !== userId;
    }, []);

    const getLock = useCallback((saleId: string): RowLock | null => {
        return locksRef.current.get(saleId) || null;
    }, []);

    /**
     * broadcastRefresh — Signal all other clients to refresh their data.
     * Uses Broadcast (not Presence) because this is a one-shot event.
     * Optionally sends the saleId that was changed for targeted highlight.
     */
    const broadcastRefresh = useCallback((saleId?: string) => {
        if (!channelRef.current) return;
        channelRef.current.send({
            type: 'broadcast',
            event: 'data-changed',
            payload: { saleId: saleId || null },
        });
    }, []);

    return {
        locks,
        lockRow,
        unlockRow,
        isLockedByOther,
        getLock,
        currentUserId,
        broadcastRefresh,
        recentlyUpdated,
    };
}
