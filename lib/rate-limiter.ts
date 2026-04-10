/**
 * Anti-Ban Rate Limiter for WhatsApp Messages
 * 
 * PAIRED SENDING STRATEGY (post-ban v2):
 * Both WhatsApp instances work in tandem. For each "pair":
 *   WA-1 sends → 5-10s gap → WA-2 sends → 35-45s gap → next pair
 * Every 4 pairs (8 messages) → random pause 5-7 minutes.
 * 
 * This doubles throughput while keeping each individual number's
 * send rate below WhatsApp's detection threshold.
 * 
 * Limits:
 * - Max 30 messages/hour (across both instances)
 * - Max 80 messages/day (across both instances)
 */

import { createAdminClient } from '@/lib/supabase/server';

// ==========================================
// Configuration — PAIRED SENDING (post-ban v2)
// ==========================================

/** Short gap between the two numbers within a pair (5-10 seconds) */
const PAIR_GAP_MIN_MS = 5_000;
const PAIR_GAP_MAX_MS = 10_000;

/** Long gap between pairs (35-45 seconds) */
const INTER_PAIR_MIN_MS = 35_000;
const INTER_PAIR_MAX_MS = 45_000;

/** Pause after N pairs (4 pairs = 8 messages) */
const PAIRS_PER_BATCH = 4;            // 4 pairs = 8 messages before pause
const BATCH_PAUSE_MIN_MS = 5 * 60_000;  // 5 minutes minimum
const BATCH_PAUSE_MAX_MS = 7 * 60_000;  // 7 minutes maximum

/** Safety limits */
const MAX_MESSAGES_PER_HOUR = 30;
const MAX_MESSAGES_PER_DAY = 80;

// ==========================================
// Random Delay Helpers
// ==========================================

/** Random ms between min and max */
function randomMs(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Wait for the short gap between paired messages (5-10s) */
export async function waitPairGap(): Promise<number> {
    const delay = randomMs(PAIR_GAP_MIN_MS, PAIR_GAP_MAX_MS);
    console.log(`[RateLimiter] Pair gap: waiting ${(delay / 1000).toFixed(1)}s before 2nd instance...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

/** Wait for the long gap between pairs (35-45s) */
export async function waitInterPairGap(): Promise<number> {
    const delay = randomMs(INTER_PAIR_MIN_MS, INTER_PAIR_MAX_MS);
    console.log(`[RateLimiter] Inter-pair gap: waiting ${(delay / 1000).toFixed(1)}s before next pair...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

/**
 * Legacy: Wait a random amount of time (used by sendText for non-paired sends).
 * Uses the inter-pair delay range (35-45s) as the default.
 */
export async function waitForRandomDelay(): Promise<number> {
    const delay = randomMs(INTER_PAIR_MIN_MS, INTER_PAIR_MAX_MS);
    console.log(`[RateLimiter] Waiting ${(delay / 1000).toFixed(1)}s before sending...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

// ==========================================
// Hourly Rate Limit
// ==========================================

export async function checkHourlyLimit(): Promise<{
    allowed: boolean;
    sent: number;
    limit: number;
}> {
    try {
        const supabase = await createAdminClient();
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

        const { count, error } = await supabase
            .from('whatsapp_send_log')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('created_at', oneHourAgo);

        if (error) {
            console.error('[RateLimiter] Error checking hourly limit:', error.message);
            return { allowed: true, sent: 0, limit: MAX_MESSAGES_PER_HOUR };
        }

        const sent = count || 0;
        return {
            allowed: sent < MAX_MESSAGES_PER_HOUR,
            sent,
            limit: MAX_MESSAGES_PER_HOUR,
        };
    } catch (err: any) {
        console.error('[RateLimiter] Exception checking hourly limit:', err.message);
        return { allowed: true, sent: 0, limit: MAX_MESSAGES_PER_HOUR };
    }
}

// ==========================================
// Daily Rate Limit
// ==========================================

export async function checkDailyLimit(): Promise<{
    allowed: boolean;
    sent: number;
    limit: number;
}> {
    try {
        const supabase = await createAdminClient();
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        const { count, error } = await supabase
            .from('whatsapp_send_log')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'sent')
            .gte('created_at', todayMidnight.toISOString());

        if (error) {
            console.error('[RateLimiter] Error checking daily limit:', error.message);
            return { allowed: true, sent: 0, limit: MAX_MESSAGES_PER_DAY };
        }

        const sent = count || 0;
        return {
            allowed: sent < MAX_MESSAGES_PER_DAY,
            sent,
            limit: MAX_MESSAGES_PER_DAY,
        };
    } catch (err: any) {
        console.error('[RateLimiter] Exception checking daily limit:', err.message);
        return { allowed: true, sent: 0, limit: MAX_MESSAGES_PER_DAY };
    }
}

// ==========================================
// Paired Batch Controller
// ==========================================

/**
 * Creates a batch controller for PAIRED sending.
 * Tracks pairs sent and triggers batch pauses every PAIRS_PER_BATCH pairs.
 */
export function createBatchController() {
    let pairsInCurrentBatch = 0;
    let batchNumber = 1;

    return {
        /**
         * Call after each PAIR is sent (2 messages).
         * Will pause for 5-7 random minutes if the current batch is full.
         */
        async afterPair(): Promise<void> {
            pairsInCurrentBatch++;
            if (pairsInCurrentBatch >= PAIRS_PER_BATCH) {
                const pauseMs = randomMs(BATCH_PAUSE_MIN_MS, BATCH_PAUSE_MAX_MS);
                console.log(
                    `[RateLimiter] Batch ${batchNumber} complete (${PAIRS_PER_BATCH} pairs = ${PAIRS_PER_BATCH * 2} msgs). ` +
                    `Pausing ${(pauseMs / 60_000).toFixed(1)} minutes before next batch...`
                );
                await new Promise(resolve => setTimeout(resolve, pauseMs));
                pairsInCurrentBatch = 0;
                batchNumber++;
                console.log(`[RateLimiter] Starting batch ${batchNumber}`);
            }
        },

        /**
         * Legacy: call before each individual message send.
         * Maps to afterPair() every 2 calls for backward compatibility.
         */
        async beforeSend(): Promise<void> {
            // No-op in paired mode — use afterPair() instead
        },

        get currentBatchCount() { return pairsInCurrentBatch * 2; },
        get currentBatch() { return batchNumber; },
        get config() {
            return {
                pairsPerBatch: PAIRS_PER_BATCH,
                batchSize: PAIRS_PER_BATCH * 2,
                pairGapMs: `${PAIR_GAP_MIN_MS / 1000}-${PAIR_GAP_MAX_MS / 1000}s`,
                interPairMs: `${INTER_PAIR_MIN_MS / 1000}-${INTER_PAIR_MAX_MS / 1000}s`,
                batchPauseMs: `${BATCH_PAUSE_MIN_MS / 60_000}-${BATCH_PAUSE_MAX_MS / 60_000}min`,
                maxPerHour: MAX_MESSAGES_PER_HOUR,
                maxPerDay: MAX_MESSAGES_PER_DAY,
            };
        },
    };
}

// ==========================================
// Exports for configuration visibility
// ==========================================

export const RATE_LIMIT_CONFIG = {
    pairGapMinMs: PAIR_GAP_MIN_MS,
    pairGapMaxMs: PAIR_GAP_MAX_MS,
    interPairMinMs: INTER_PAIR_MIN_MS,
    interPairMaxMs: INTER_PAIR_MAX_MS,
    pairsPerBatch: PAIRS_PER_BATCH,
    batchPauseMinMs: BATCH_PAUSE_MIN_MS,
    batchPauseMaxMs: BATCH_PAUSE_MAX_MS,
    maxMessagesPerHour: MAX_MESSAGES_PER_HOUR,
    maxMessagesPerDay: MAX_MESSAGES_PER_DAY,
} as const;
