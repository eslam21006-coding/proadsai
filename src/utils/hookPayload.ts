// src/utils/hookPayload.ts
// ═══════════════════════════════════════════════════════════════════════════
// HOOK PAYLOAD VALIDATOR & NORMALIZER — Client-side
// Shared utility for validating and normalizing hook generation output
// before it enters the Hook Lab UI.
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedHook {
    variant: string; // A, B, C, D
    hookText: string;
    subheadline: string;
    ctaButton: string;
    raw: string;
}

export interface HookValidationResult {
    valid: boolean;
    reason?: string;
    count: number;
    hooks: ParsedHook[];
    missingVariants: string[];
}

const HOOK_VARIANTS = ['A', 'B', 'C', 'D'];

/**
 * Extract a section between two markers (case-insensitive, colon-tolerant).
 * Lightweight version of App.tsx getSection for standalone use.
 */
function extractBetween(text: string, startKey: string, endKey: string): string {
    if (!text) return '';
    const upper = text.toUpperCase();
    const skU = startKey.toUpperCase().replace(/:\s*$/, '');
    const ekU = endKey.toUpperCase().replace(/:\s*$/, '');

    let si = upper.indexOf(skU);
    if (si === -1) return '';
    let cs = si + skU.length;
    // Skip optional colon + whitespace
    if (cs < text.length && (text[cs] === ':' || text[cs] === '：')) cs++;
    while (cs < text.length && /\s/.test(text[cs])) cs++;

    let ei = upper.indexOf(ekU, cs);
    if (ei === -1) return text.slice(cs).trim();
    return text.slice(cs, ei).trim();
}

/**
 * Parse canonical hook blocks from raw text.
 * Supports both HOOK_START_X and ANGLE_START_X markers.
 */
export function parseCanonicalHooks(raw: string): ParsedHook[] {
    if (!raw || typeof raw !== 'string') return [];
    const hooks: ParsedHook[] = [];

    for (const v of HOOK_VARIANTS) {
        // Support both HOOK_START_X and ANGLE_START_X (carousel)
        const hookStart = `HOOK_START_${v}`;
        const hookEnd = `HOOK_END_${v}`;
        const angleStart = `ANGLE_START_${v}`;
        const angleEnd = `ANGLE_END_${v}`;

        let blockRaw = extractBetween(raw, hookStart, hookEnd);
        if (!blockRaw.trim()) {
            blockRaw = extractBetween(raw, angleStart, angleEnd);
        }
        if (!blockRaw.trim()) continue;

        const hookText = extractBetween(blockRaw, 'HOOK_TEXT', 'SUBHEADLINE')
            .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();
        const subheadline = extractBetween(blockRaw, 'SUBHEADLINE', 'CTA_BUTTON')
            .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();

        // CTA_BUTTON may be followed by HOOK_END, ANGLE_END, or nothing
        let ctaRaw = extractBetween(blockRaw, 'CTA_BUTTON', 'HOOK_END');
        if (!ctaRaw) ctaRaw = extractBetween(blockRaw, 'CTA_BUTTON', 'ANGLE_END');
        if (!ctaRaw) {
            // Last field — take everything after CTA_BUTTON
            const ctaMatch = blockRaw.match(/CTA[_\s]*BUTTON\s*[:：]?\s*([\s\S]*?)$/i);
            ctaRaw = ctaMatch ? ctaMatch[1].trim() : '';
        }
        // Clean leaked end markers
        ctaRaw = ctaRaw.replace(/HOOK_END.*|ANGLE_END.*/gi, '').trim();

        hooks.push({
            variant: v,
            hookText,
            subheadline,
            ctaButton: ctaRaw.replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim(),
            raw: blockRaw,
        });
    }

    return hooks;
}

/**
 * Validate whether raw hook text contains valid canonical hook structure.
 * Returns detailed validation result.
 */
export function validateCanonicalHooks(raw: string): HookValidationResult {
    if (!raw || typeof raw !== 'string' || raw.trim().length < 20) {
        return {
            valid: false,
            reason: 'Hook output is empty or too short',
            count: 0,
            hooks: [],
            missingVariants: [...HOOK_VARIANTS],
        };
    }

    const hooks = parseCanonicalHooks(raw);
    const foundVariants = hooks.map(h => h.variant);
    const missingVariants = HOOK_VARIANTS.filter(v => !foundVariants.includes(v));

    // Check that each found hook has HOOK_TEXT, SUBHEADLINE, and CTA_BUTTON (complete hook)
    const validHooks = hooks.filter(h => h.hookText.length >= 3 && h.subheadline.length >= 3 && h.ctaButton.length >= 2);

    if (validHooks.length === 0) {
        return {
            valid: false,
            reason: 'No valid hook blocks found. Model output may be malformed.',
            count: 0,
            hooks: [],
            missingVariants: [...HOOK_VARIANTS],
        };
    }

    // We require at least 3 out of 4 hooks (allowing 1 to be recoverable)
    // But ideally all 4
    if (validHooks.length < 3) {
        return {
            valid: false,
            reason: `Only ${validHooks.length}/4 hooks have valid content. Need at least 3.`,
            count: validHooks.length,
            hooks: validHooks,
            missingVariants,
        };
    }

    return {
        valid: true,
        count: validHooks.length,
        hooks: validHooks,
        missingVariants,
    };
}

/**
 * Quick boolean check: is this hook payload valid for Hook Lab entry?
 */
export function isValidHookPayload(raw: string): boolean {
    return validateCanonicalHooks(raw).valid;
}

/**
 * Attempt to normalize semi-structured hook output into canonical format.
 * Returns normalized text or null if unrepairable.
 */
export function normalizeHooksToCanonical(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;

    // First check if it's already valid
    const validation = validateCanonicalHooks(raw);
    if (validation.valid && validation.count >= 3) {
        // Already parseable — return as-is (it works)
        return raw;
    }

    // Try repair: look for numbered hook patterns without markers
    // e.g. "1." or "Hook 1:" or "الخطاف 1:" patterns
    const repairPatterns = [
        // Pattern: numbered sections with hook content
        /(?:hook|خطاف)\s*(\d+|[A-Da-d])\s*[:：\-]\s*([\s\S]*?)(?=(?:hook|خطاف)\s*\d|$)/gi,
        // Pattern: numbered list items
        /(\d+)\.\s*(?:HOOK_TEXT\s*[:：]?)?\s*([\s\S]*?)(?=\d+\.|$)/gi,
    ];

    for (const pattern of repairPatterns) {
        const matches = [...raw.matchAll(pattern)];
        if (matches.length >= 3) {
            // Attempt to build canonical blocks
            const variants = ['A', 'B', 'C', 'D'];
            let rebuilt = '';
            for (let i = 0; i < Math.min(matches.length, 4); i++) {
                const content = (matches[i][2] || matches[i][0]).trim();
                if (content.length < 5) continue;

                // Try to extract hook_text / subheadline from content
                let hookText = content;
                let subheadline = '';
                let cta = '';

                // If content has newlines, first line is hook_text, second is subheadline
                const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
                if (lines.length >= 2) {
                    hookText = lines[0].replace(/^[-–•*]\s*/, '');
                    subheadline = lines[1].replace(/^[-–•*]\s*/, '');
                    if (lines.length >= 3) cta = lines[2].replace(/^[-–•*]\s*/, '');
                }

                rebuilt += `HOOK_START_${variants[i]}\nHOOK_TEXT: ${hookText}\nSUBHEADLINE: ${subheadline}\nCTA_BUTTON: ${cta}\nHOOK_END_${variants[i]}\n\n`;
            }

            if (rebuilt.trim()) {
                const reValidation = validateCanonicalHooks(rebuilt);
                if (reValidation.valid) return rebuilt;
            }
        }
    }

    // If we have some valid hooks (e.g., 3 out of 4), still return the raw — 
    // the UI can handle partial display
    if (validation.count >= 3) {
        return raw;
    }

    return null; // Unrepairable
}

/**
 * Get a human-readable summary of hook validation issues.
 */
export function getHookValidationSummary(raw: string): string {
    const result = validateCanonicalHooks(raw);
    if (result.valid) return `Valid: ${result.count}/4 hooks`;
    return result.reason || `Invalid: ${result.count}/4 hooks found`;
}