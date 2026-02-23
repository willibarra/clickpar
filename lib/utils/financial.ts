/**
 * Utilidades de cálculo financiero para ClickPar
 */

/**
 * Calcular proyección de ganancia para una cuenta madre
 */
export function calculateProjection(
    purchaseCostGs: number,
    slotPriceGs: number,
    maxSlots: number
): {
    totalRevenue: number;
    profit: number;
    profitPerSlot: number;
    margin: number;
} {
    const totalRevenue = slotPriceGs * maxSlots;
    const profit = totalRevenue - purchaseCostGs;
    const profitPerSlot = maxSlots > 0 ? profit / maxSlots : 0;
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;

    return {
        totalRevenue,
        profit,
        profitPerSlot,
        margin,
    };
}

/**
 * Formatear número como moneda guaraní
 */
export function formatCurrency(amount: number): string {
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

/**
 * Calcular días hasta una fecha
 */
export function daysUntil(date: string | Date): number {
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const diff = targetDate.getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
