// src/utils/textHelpers.ts

export const getSection = (text: string, startKey: string, endKey: string): string => {
    if (!text) return '';
    const sk = (startKey || '').replace(/:\s*$/g, '').trim();
    const ek = (endKey || '').replace(/:\s*$/g, '').trim();
    const upper = text.toUpperCase();
    const skUpper = sk.toUpperCase();
    const ekUpper = ek.toUpperCase();

    let startIndex = upper.indexOf(skUpper);
    if (startIndex === -1) return '';

    let contentStart = startIndex + sk.length;
    const maybeColon = text.slice(contentStart, contentStart + 2);
    if (maybeColon.startsWith(':') || maybeColon.startsWith('：')) contentStart += 1;
    while (contentStart < text.length && /\s/.test(text[contentStart])) contentStart++;

    let endIndex = upper.indexOf(ekUpper, contentStart);
    if (endIndex === -1) {
        const afterStart = text.slice(contentStart);
        const escaped = ek.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = afterStart.match(new RegExp(`\\n\\s*${escaped}\\s*:?\\S*`, 'i'));
        if (m && typeof m.index === 'number') {
            endIndex = contentStart + m.index;
        }
    }
    if (endIndex === -1) return text.slice(contentStart).trim();
    return text.slice(contentStart, endIndex).trim();
};

export const getConceptBlock = (text: string, n: number): string => {
    return getSection(text, `CONCEPT_START_${n}`, `CONCEPT_END_${n}`);
};