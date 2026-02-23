/**
 * Algoritmo Tetris para selección óptima de slots
 * 
 * Prioriza slots basándose en:
 * 1. Sincronización de fechas (fecha de venta + duración vs. renewalDate)
 * 2. Urgencia (cuentas próximas a vencer tienen prioridad)
 * 3. Ocupación (cuentas con más slots vendidos se priorizan para maximizar uso)
 */

export interface SlotWithAccount {
    id: string;
    slot_identifier: string | null;
    status: string;
    mother_accounts: {
        id: string;
        platform: string;
        email: string;
        renewal_date: string;
        target_billing_day: number | null;
        default_slot_price_gs: number | null;
        max_slots: number;
    } | null;
}

export interface TetrisResult {
    slot: SlotWithAccount;
    score: number;
    reason: string;
    details: {
        syncScore: number;
        urgencyScore: number;
        occupancyScore: number;
    };
}

/**
 * Calcula la puntuación Tetris para un slot
 */
function calculateTetrisScore(
    slot: SlotWithAccount,
    saleDate: Date,
    durationDays: number,
    allSlots: SlotWithAccount[]
): TetrisResult | null {
    if (!slot.mother_accounts) return null;

    const renewalDate = new Date(slot.mother_accounts.renewal_date);
    const endDate = new Date(saleDate);
    endDate.setDate(endDate.getDate() + durationDays);

    // 1. SYNC SCORE (0-40 puntos): Qué tan bien se alinea con el ciclo de renovación
    const daysUntilRenewal = Math.ceil((renewalDate.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
    let syncScore = 0;
    let syncReason = '';

    if (daysUntilRenewal >= 0 && daysUntilRenewal <= 5) {
        // Perfecto: La suscripción termina justo antes de la renovación
        syncScore = 40;
        syncReason = 'Sincronización perfecta con ciclo';
    } else if (daysUntilRenewal > 5 && daysUntilRenewal <= 15) {
        syncScore = 30;
        syncReason = 'Buena sincronización';
    } else if (daysUntilRenewal > 15 && daysUntilRenewal <= 30) {
        syncScore = 20;
        syncReason = 'Sincronización aceptable';
    } else if (daysUntilRenewal < 0) {
        // La cuenta se renueva antes de que termine la suscripción (no ideal)
        syncScore = Math.max(0, 10 + daysUntilRenewal); // Penaliza según cuánto se pase
        syncReason = 'Renovación durante suscripción activa';
    } else {
        syncScore = 10;
        syncReason = 'Sincronización baja';
    }

    // 2. URGENCY SCORE (0-30 puntos): Prioriza cuentas por vencer
    const daysToRenewalFromNow = Math.ceil((renewalDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    let urgencyScore = 0;

    if (daysToRenewalFromNow <= 7) {
        urgencyScore = 30; // Muy urgente
    } else if (daysToRenewalFromNow <= 14) {
        urgencyScore = 20;
    } else if (daysToRenewalFromNow <= 30) {
        urgencyScore = 10;
    }

    // 3. OCCUPANCY SCORE (0-30 puntos): Prioriza cuentas con más slots ocupados
    const slotsFromSameAccount = allSlots.filter(
        s => s.mother_accounts?.id === slot.mother_accounts?.id
    );
    const soldSlots = slotsFromSameAccount.filter(s => s.status === 'sold').length;
    const totalSlots = slot.mother_accounts.max_slots;
    const occupancyRate = soldSlots / totalSlots;
    const occupancyScore = Math.round(occupancyRate * 30);

    const totalScore = syncScore + urgencyScore + occupancyScore;

    // Determinar razón principal
    let mainReason = syncReason;
    if (urgencyScore >= 20 && urgencyScore >= syncScore) {
        mainReason = daysToRenewalFromNow <= 7
            ? `Urgente: vence en ${daysToRenewalFromNow} días`
            : `Próxima a vencer: ${daysToRenewalFromNow} días`;
    }

    return {
        slot,
        score: totalScore,
        reason: mainReason,
        details: {
            syncScore,
            urgencyScore,
            occupancyScore,
        },
    };
}

/**
 * Encuentra el slot óptimo usando el algoritmo Tetris
 */
export function findOptimalSlot(
    availableSlots: SlotWithAccount[],
    saleDate: Date = new Date(),
    durationDays: number = 30
): TetrisResult | null {
    if (availableSlots.length === 0) return null;

    const scoredSlots = availableSlots
        .map(slot => calculateTetrisScore(slot, saleDate, durationDays, availableSlots))
        .filter((result): result is TetrisResult => result !== null)
        .sort((a, b) => b.score - a.score);

    return scoredSlots.length > 0 ? scoredSlots[0] : null;
}

/**
 * Obtiene todos los slots ordenados por puntuación Tetris
 */
export function rankSlotsByTetris(
    availableSlots: SlotWithAccount[],
    saleDate: Date = new Date(),
    durationDays: number = 30
): TetrisResult[] {
    return availableSlots
        .map(slot => calculateTetrisScore(slot, saleDate, durationDays, availableSlots))
        .filter((result): result is TetrisResult => result !== null)
        .sort((a, b) => b.score - a.score);
}

/**
 * Filtra slots por plataforma
 */
export function filterSlotsByPlatform(
    slots: SlotWithAccount[],
    platform: string
): SlotWithAccount[] {
    return slots.filter(s =>
        s.mother_accounts?.platform.toLowerCase() === platform.toLowerCase()
    );
}
