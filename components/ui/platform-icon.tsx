'use client';

/**
 * PlatformIcon — renders a recognizable SVG icon for each streaming platform.
 * Falls back to a coloured circle with the first letter.
 */

const PLATFORM_COLORS: Record<string, string> = {
    'Netflix': '#E50914',
    'Prime Video': '#00A8E1',
    'Amazon Prime Video': '#00A8E1',
    'Disney+': '#0063E5',
    'HBO Max': '#5C16C5',
    'Crunchyroll': '#F47521',
    'Paramount+': '#0064FF',
    'Spotify Premium': '#1DB954',
    'YouTube Premium': '#FF0000',
    'FLUJOTV': '#00C853',
    'Vix': '#F5C518',
    'Apple TV+': '#000000',
    'Tidal': '#000000',
    'Star+': '#C724B1',
};

interface PlatformIconProps {
    platform: string;
    size?: number;
    className?: string;
}

export function PlatformIcon({ platform, size = 32, className = '' }: PlatformIconProps) {
    const color = PLATFORM_COLORS[platform] || '#6B7280';
    const s = size;
    const half = s / 2;

    switch (platform) {
        case 'Netflix':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Netflix">
                    <rect width="32" height="32" rx="8" fill="#E50914" />
                    <path d="M9 6h4.5l5 14.5V6H23v20h-4.5l-5-14.5V26H9V6Z" fill="white" />
                </svg>
            );

        case 'Prime Video':
        case 'Amazon Prime Video':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Prime Video">
                    <rect width="32" height="32" rx="8" fill="#00A8E1" />
                    <polygon points="16,7 10,25 14,25 16,19 18,25 22,25" fill="white" />
                    <path d="M8 22 Q16 28 24 22" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                </svg>
            );

        case 'Disney+':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Disney+">
                    <rect width="32" height="32" rx="8" fill="#0063E5" />
                    <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="10" fontWeight="bold" fontFamily="system-ui">D+</text>
                    <path d="M6 22 Q16 28 26 21" stroke="#fff" strokeWidth="1" fill="none" />
                </svg>
            );

        case 'HBO Max':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="HBO Max">
                    <rect width="32" height="32" rx="8" fill="#5C16C5" />
                    <text x="16" y="16" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="8" fontWeight="bold" fontFamily="system-ui">MAX</text>
                </svg>
            );

        case 'Crunchyroll':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Crunchyroll">
                    <rect width="32" height="32" rx="8" fill="#F47521" />
                    <circle cx="16" cy="16" r="8" fill="white" />
                    <circle cx="16" cy="16" r="5" fill="#F47521" />
                    <circle cx="19" cy="13" r="2" fill="white" />
                </svg>
            );

        case 'Paramount+':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Paramount+">
                    <rect width="32" height="32" rx="8" fill="#0064FF" />
                    <polygon points="16,6 10,26 13,26 16,16 19,26 22,26" fill="white" />
                    <circle cx="16" cy="8" r="2" fill="white" />
                </svg>
            );

        case 'Spotify Premium':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Spotify Premium">
                    <rect width="32" height="32" rx="8" fill="#1DB954" />
                    <circle cx="16" cy="16" r="10" fill="#1DB954" stroke="white" strokeWidth="1.5" />
                    <path d="M10 13 Q16 10 22 13" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" />
                    <path d="M11 17 Q16 14 21 17" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    <path d="M12 21 Q16 18 20 21" stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" />
                </svg>
            );

        case 'YouTube Premium':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="YouTube Premium">
                    <rect width="32" height="32" rx="8" fill="#FF0000" />
                    <rect x="6" y="9" width="20" height="14" rx="4" fill="white" />
                    <polygon points="14,12 14,22 21,17" fill="#FF0000" />
                </svg>
            );

        case 'FLUJOTV':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="FLUJOTV">
                    <rect width="32" height="32" rx="8" fill="#00C853" />
                    <rect x="8" y="8" width="16" height="12" rx="2" fill="white" />
                    <polygon points="13,11 13,17 19,14" fill="#00C853" />
                    <rect x="12" y="22" width="8" height="2" rx="1" fill="white" />
                </svg>
            );

        case 'Vix':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Vix">
                    <rect width="32" height="32" rx="8" fill="#1A1A2E" />
                    <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fill="#F5C518" fontSize="12" fontWeight="bold" fontFamily="system-ui">VIX</text>
                </svg>
            );

        case 'Apple TV+':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Apple TV+">
                    <rect width="32" height="32" rx="8" fill="#1a1a1a" />
                    <path d="M16 8c0.5-2 2-3.5 3.5-4 -0.2 1.8-1.5 3.5-3.5 4zM12 14c-0.5-2 1-4 3-5 0.5 2-0.5 4.5-3 5zM16 14c2-0.5 3.5-3 3-5 -2 1-3.5 3-3 5zM11.5 15c0 4 3 7 4.5 8 1.5-1 4.5-4 4.5-8 0-2-2-3-4.5-1-2.5-2-4.5-1-4.5 1z" fill="white" />
                </svg>
            );

        case 'Tidal':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Tidal">
                    <rect width="32" height="32" rx="8" fill="#000" />
                    <polygon points="11,12 16,17 21,12 16,7" fill="white" />
                    <polygon points="6,17 11,22 16,17 11,12" fill="white" />
                    <polygon points="16,17 21,22 26,17 21,12" fill="white" />
                    <polygon points="11,22 16,27 21,22 16,17" fill="white" />
                </svg>
            );

        case 'Star+':
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label="Star+">
                    <rect width="32" height="32" rx="8" fill="#C724B1" />
                    <polygon points="16,6 18,13 25,13 19,17 21,24 16,20 11,24 13,17 7,13 14,13" fill="white" />
                </svg>
            );

        default:
            // Fallback: coloured circle with first letter
            return (
                <svg width={s} height={s} viewBox="0 0 32 32" className={className} aria-label={platform}>
                    <rect width="32" height="32" rx="8" fill={color} />
                    <text x="16" y="17" textAnchor="middle" dominantBaseline="central" fill="white" fontSize="14" fontWeight="bold" fontFamily="system-ui">
                        {platform.charAt(0)}
                    </text>
                </svg>
            );
    }
}
