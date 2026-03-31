// functions/src/utils/hookPayload.ts
// ═══════════════════════════════════════════════════════════════════════════
// HOOK PAYLOAD VALIDATOR & NORMALIZER — Server-side
// Used by generateTOV to validate output before returning to client.
// ═══════════════════════════════════════════════════════════════════════════

export interface ParsedHook {
    variant: string;
    hookText: string;
    subheadline: string;
    ctaButton: string;
}

export interface HookValidationResult {
    valid: boolean;
    reason?: string;
    count: number;
    hooks: ParsedHook[];
}

export interface SemanticLock {
    angle: string;
    mechanism: string;
    audience: string;
    pain: string;
    desiredOutcome: string;
    promiseType: string;
    emotionalFrame: string;
    objectionFrame?: string;
}

const HOOK_VARIANTS = ['A', 'B', 'C', 'D'];

function extractBetween(text: string, startKey: string, endKey: string): string {
    if (!text) return '';
    const upper = text.toUpperCase();
    const skU = startKey.toUpperCase().replace(/:\s*$/, '');
    const ekU = endKey.toUpperCase().replace(/:\s*$/, '');

    let si = upper.indexOf(skU);
    if (si === -1) return '';
    let cs = si + skU.length;
    if (cs < text.length && (text[cs] === ':' || text[cs] === '\uFF1A')) cs++;
    while (cs < text.length && /\s/.test(text[cs])) cs++;

    let ei = upper.indexOf(ekU, cs);
    if (ei === -1) return text.slice(cs).trim();
    return text.slice(cs, ei).trim();
}

export function parseSingleHookBlock(raw: string): ParsedHook | null {
    if (!raw || typeof raw !== 'string') return null;
    const variantMatch = raw.match(/(?:HOOK|ANGLE)_START_([A-D])/i);
    const variant = variantMatch?.[1]?.toUpperCase() || 'A';
    const hookText = extractBetween(raw, 'HOOK_TEXT', 'SUBHEADLINE')
        .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();
    const subheadline = extractBetween(raw, 'SUBHEADLINE', 'CTA_BUTTON')
        .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();
    let ctaRaw = extractBetween(raw, 'CTA_BUTTON', 'HOOK_END');
    if (!ctaRaw) ctaRaw = extractBetween(raw, 'CTA_BUTTON', 'ANGLE_END');
    if (!ctaRaw) {
        const ctaMatch = raw.match(/CTA[_\s]*BUTTON\s*[:：]?\s*([\s\S]*?)$/i);
        ctaRaw = ctaMatch ? ctaMatch[1].trim() : '';
    }
    ctaRaw = ctaRaw.replace(/HOOK_END.*|ANGLE_END.*/gi, '').trim();
    if (!hookText && !subheadline && !ctaRaw) return null;
    return {
        variant,
        hookText,
        subheadline,
        ctaButton: ctaRaw.replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim(),
    };
}

export function parseHookBlocks(raw: string): ParsedHook[] {
    if (!raw || typeof raw !== 'string') return [];
    const hooks: ParsedHook[] = [];

    for (const v of HOOK_VARIANTS) {
        const hookStart = `HOOK_START_${v}`;
        const hookEnd = `HOOK_END_${v}`;
        const angleStart = `ANGLE_START_${v}`;
        const angleEnd = `ANGLE_END_${v}`;

        let blockRaw = extractBetween(raw, hookStart, hookEnd);
        if (!blockRaw.trim()) blockRaw = extractBetween(raw, angleStart, angleEnd);
        if (!blockRaw.trim()) continue;

        const hookText = extractBetween(blockRaw, 'HOOK_TEXT', 'SUBHEADLINE')
            .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();
        const subheadline = extractBetween(blockRaw, 'SUBHEADLINE', 'CTA_BUTTON')
            .replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim();

        let ctaRaw = extractBetween(blockRaw, 'CTA_BUTTON', 'HOOK_END');
        if (!ctaRaw) ctaRaw = extractBetween(blockRaw, 'CTA_BUTTON', 'ANGLE_END');
        if (!ctaRaw) {
            const ctaMatch = blockRaw.match(/CTA[_\s]*BUTTON\s*[:：]?\s*([\s\S]*?)$/i);
            ctaRaw = ctaMatch ? ctaMatch[1].trim() : '';
        }
        ctaRaw = ctaRaw.replace(/HOOK_END.*|ANGLE_END.*/gi, '').trim();

        hooks.push({
            variant: v,
            hookText,
            subheadline,
            ctaButton: ctaRaw.replace(/\*\*/g, '').replace(/^\s*[:：\-–•]+\s*/g, '').trim(),
        });
    }
    return hooks;
}

export function validateHookResponse(raw: string): HookValidationResult {
    if (!raw || typeof raw !== 'string' || raw.trim().length < 20) {
        return { valid: false, reason: 'Hook output is empty or too short', count: 0, hooks: [] };
    }

    const hooks = parseHookBlocks(raw);
    const validHooks = hooks.filter(h => h.hookText.length >= 3);

    if (validHooks.length === 0) {
        return { valid: false, reason: 'No valid hook blocks with HOOK_TEXT found', count: 0, hooks: [] };
    }

    if (validHooks.length < 3) {
        return { valid: false, reason: `Only ${validHooks.length}/4 hooks have valid content`, count: validHooks.length, hooks: validHooks };
    }

    return { valid: true, count: validHooks.length, hooks: validHooks };
}

/**
 * Attempt to normalize raw hook output into canonical format.
 * Returns normalized text, or null if unrepairable.
 */
export function normalizeHookResponse(raw: string): string | null {
    if (!raw) return null;

    const validation = validateHookResponse(raw);
    if (validation.valid) {
        return raw;
    }

    if (validation.hooks.length >= 2) {
        const variants = ['A', 'B', 'C', 'D'];
        let rebuilt = '';
        for (let i = 0; i < validation.hooks.length && i < 4; i++) {
            const h = validation.hooks[i];
            const v = h.variant || variants[i];
            rebuilt += `HOOK_START_${v}\nHOOK_TEXT: ${h.hookText}\nSUBHEADLINE: ${h.subheadline}\nCTA_BUTTON: ${h.ctaButton}\nHOOK_END_${v}\n\n`;
        }

        const reValidation = validateHookResponse(rebuilt);
        if (reValidation.valid || reValidation.count >= 3) return rebuilt;
    }

    const blocks = raw.split(/\n{2,}/).filter(b => b.trim().length > 10);
    if (blocks.length >= 3) {
        const variants = ['A', 'B', 'C', 'D'];
        let rebuilt = '';
        for (let i = 0; i < Math.min(blocks.length, 4); i++) {
            const lines = blocks[i].split('\n').map(l => l.replace(/^\s*\d+[.)]\s*/, '').replace(/^[-–•*]\s*/, '').trim()).filter(Boolean);
            if (lines.length === 0) continue;

            if (blocks[i].toUpperCase().includes('HOOK_TEXT')) {
                rebuilt += blocks[i].includes(`HOOK_START_${variants[i]}`) ? blocks[i] + '\n\n' :
                    `HOOK_START_${variants[i]}\n${blocks[i]}\nHOOK_END_${variants[i]}\n\n`;
                continue;
            }

            const hookText = lines[0] || '';
            const subheadline = lines.length > 1 ? lines[1] : '';
            const cta = lines.length > 2 ? lines[2] : '';
            rebuilt += `HOOK_START_${variants[i]}\nHOOK_TEXT: ${hookText}\nSUBHEADLINE: ${subheadline}\nCTA_BUTTON: ${cta}\nHOOK_END_${variants[i]}\n\n`;
        }

        const reValidation = validateHookResponse(rebuilt);
        if (reValidation.count >= 3) return rebuilt;
    }

    return null;
}

function normalizeForCompare(value: string): string {
    return (value || '')
        .toLowerCase()
        .replace(/[\u064B-\u065F]/g, '')
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenize(value: string): string[] {
    return normalizeForCompare(value).split(' ').filter(Boolean);
}

function hasMeaningfulOverlap(a: string, b: string): boolean {
    const aTokens = new Set(tokenize(a).filter(t => t.length >= 3));
    const bTokens = tokenize(b).filter(t => t.length >= 3);
    if (aTokens.size === 0 || bTokens.length === 0) return true;
    const shared = bTokens.filter(t => aTokens.has(t));
    return shared.length >= Math.min(2, Math.ceil(bTokens.length * 0.3));
}

export function assertHookSemanticPreservation(
    originalHookBlock: string,
    editedHookBlock: string,
    semanticLock?: SemanticLock | null,
): { ok: boolean; reason?: string } {
    if (!semanticLock) return { ok: true };

    const original = parseSingleHookBlock(originalHookBlock);
    const edited = parseSingleHookBlock(editedHookBlock);
    if (!original || !edited) return { ok: false, reason: 'Edited hook could not be parsed.' };
    if (!edited.hookText.trim()) return { ok: false, reason: 'Edited hook is empty.' };

    const originalCombined = `${original.hookText} ${original.subheadline}`.trim();
    const editedCombined = `${edited.hookText} ${edited.subheadline}`.trim();

    if (!hasMeaningfulOverlap(originalCombined, editedCombined) && !hasMeaningfulOverlap(semanticLock.mechanism, editedCombined)) {
        return { ok: false, reason: 'Semantic angle drift detected.' };
    }
    if (semanticLock.mechanism && !hasMeaningfulOverlap(semanticLock.mechanism, editedCombined)) {
        return { ok: false, reason: 'Core mechanism changed during wording edit.' };
    }
    if (semanticLock.promiseType && !hasMeaningfulOverlap(semanticLock.promiseType, editedCombined) && !hasMeaningfulOverlap(semanticLock.desiredOutcome, editedCombined)) {
        return { ok: false, reason: 'Core promise changed during wording edit.' };
    }

    return { ok: true };
}
