/**
 * Anti-Ban Rate Limiter for WhatsApp Messages
 * 
 * Centralizes all anti-spam protections:
 * - Random delay between messages (8-25 seconds)
 * - Hourly rate limit (max 30 messages/hour)
 * - Batch control (max 10 per batch, 5 min pause between batches)
 */

import { createAdminClient } from '@/lib/supabase/server';

// ==========================================
// Configuration
// ==========================================

const MIN_DELAY_MS = 8_000;   // 8 seconds minimum
const MAX_DELAY_MS = 25_000;  // 25 seconds maximum
const MAX_MESSAGES_PER_HOUR = 30;
const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 5 * 60 * 1000; // 5 minutes between batches

// ==========================================
// Random Delay
// ==========================================

/**
 * Wait a random amount of time between MIN_DELAY_MS and MAX_DELAY_MS.
 * Returns the actual delay applied in milliseconds.
 */
export async function waitForRandomDelay(): Promise<number> {
    const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
    console.log(`[RateLimiter] Waiting ${(delay / 1000).toFixed(1)}s before sending...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return delay;
}

// ==========================================
// Hourly Rate Limit
// ==========================================

/**
 * Check how many messages have been sent in the last hour.
 * Returns { allowed: boolean, sent: number, limit: number }.
 */
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
            // On error, allow the message (fail-open) but log the issue
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
// Batch Controller
// ==========================================

/**
 * Creates a batch controller that tracks message count within a batch
 * and pauses when the batch limit is reached.
 */
export function createBatchController() {
    let messagesInCurrentBatch = 0;
    let batchNumber = 1;

    return {
        /**
         * Call before each message send. Will pause for BATCH_PAUSE_MS
         * if the current batch is full (BATCH_SIZE reached).
         */
        async beforeSend(): Promise<void> {
            if (messagesInCurrentBatch >= BATCH_SIZE) {
                console.log(
                    `[RateLimiter] Batch ${batchNumber} complete (${BATCH_SIZE} msgs). ` +
                    `Pausing ${BATCH_PAUSE_MS / 1000 / 60} minutes before next batch...`
                );
                await new Promise(resolve => setTimeout(resolve, BATCH_PAUSE_MS));
                messagesInCurrentBatch = 0;
                batchNumber++;
                console.log(`[RateLimiter] Starting batch ${batchNumber}`);
            }
            messagesInCurrentBatch++;
        },

        /** Current count of messages sent in this batch */
        get currentBatchCount() {
            return messagesInCurrentBatch;
        },

        /** Current batch number */
        get currentBatch() {
            return batchNumber;
        },

        /** Configuration constants */
        get config() {
            return {
                batchSize: BATCH_SIZE,
                batchPauseMs: BATCH_PAUSE_MS,
                minDelayMs: MIN_DELAY_MS,
                maxDelayMs: MAX_DELAY_MS,
                maxPerHour: MAX_MESSAGES_PER_HOUR,
            };
        },
    };
}

// ==========================================
// Exports for configuration visibility
// ==========================================

export const RATE_LIMIT_CONFIG = {
    minDelayMs: MIN_DELAY_MS,
    maxDelayMs: MAX_DELAY_MS,
    maxMessagesPerHour: MAX_MESSAGES_PER_HOUR,
    batchSize: BATCH_SIZE,
    batchPauseMs: BATCH_PAUSE_MS,
} as const;
