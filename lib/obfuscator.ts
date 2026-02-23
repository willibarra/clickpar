/**
 * Anti-Ban Obfuscator para mensajes de Kommo/WhatsApp
 * Evita detección de palabras clave por Meta
 */

type ObfuscationRule = {
    pattern: RegExp;
    replacements: string[];
};

const obfuscationRules: ObfuscationRule[] = [
    // Plataformas de streaming
    { pattern: /Netflix/gi, replacements: ['N-et', 'La Roja', 'Plataforma N', 'N*tflix'] },
    { pattern: /HBO/gi, replacements: ['H-BO', 'La Morada', 'Plataforma H', 'H*BO'] },
    { pattern: /Disney/gi, replacements: ['D-isney', 'La Azul', 'Plataforma D', 'D*sney'] },
    { pattern: /Spotify/gi, replacements: ['Sp-otify', 'La Verde', 'Plataforma S', 'Sp*tify'] },
    { pattern: /Amazon/gi, replacements: ['Am-azon', 'La de Jeff', 'Plataforma A', 'Am*zon'] },

    // Términos comerciales
    { pattern: /precio/gi, replacements: ['inversión', 'aporte', 'valor', 'contribución'] },
    { pattern: /comprar/gi, replacements: ['adquirir', 'obtener', 'solicitar', 'reservar'] },
    { pattern: /venta/gi, replacements: ['intercambio', 'entrega', 'transacción', 'proceso'] },
    { pattern: /cuenta/gi, replacements: ['acceso', 'servicio', 'plan', 'membresía'] },
    { pattern: /perfil/gi, replacements: ['espacio', 'usuario', 'slot', 'lugar'] },
    { pattern: /pagar/gi, replacements: ['aportar', 'transferir', 'enviar', 'depositar'] },
    { pattern: /renovar/gi, replacements: ['continuar', 'extender', 'prolongar', 'mantener'] },
];

/**
 * Selecciona un reemplazo aleatorio de la lista
 */
function getRandomReplacement(replacements: string[]): string {
    return replacements[Math.floor(Math.random() * replacements.length)];
}

/**
 * Ofusca un texto aplicando todas las reglas de reemplazo
 */
export function obfuscateText(text: string): string {
    let result = text;

    for (const rule of obfuscationRules) {
        result = result.replace(rule.pattern, () => getRandomReplacement(rule.replacements));
    }

    return result;
}

/**
 * Agrega caracteres invisibles entre letras para evitar detección
 */
export function addInvisibleChars(text: string): string {
    const invisibleChar = '\u200B'; // Zero-width space
    return text.split('').join(invisibleChar);
}

/**
 * Reemplaza vocales con caracteres similares
 */
export function replaceVowels(text: string): string {
    const vowelMap: Record<string, string> = {
        'a': 'а', // Cyrillic 'a'
        'e': 'е', // Cyrillic 'e'
        'i': 'і', // Cyrillic 'i'
        'o': 'о', // Cyrillic 'o'
    };

    return text.split('').map(char => vowelMap[char.toLowerCase()] || char).join('');
}

/**
 * Combina múltiples técnicas de ofuscación
 */
export function fullyObfuscate(text: string): string {
    return obfuscateText(text);
}
