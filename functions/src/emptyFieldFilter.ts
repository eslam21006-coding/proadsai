// functions/src/emptyFieldFilter.ts — value_stack field suppression

import type { FilterResult } from "./types.js";

// ═══════════════════════════════════════════════════════════
// CANONICAL FIELDS
// ═══════════════════════════════════════════════════════════

export const VALUE_STACK_FIELDS = [
    "valueStackTitle",
    "valueStackItems",
    "valueStackBonuses",
    "valueStackPrice",
    "valueStackOriginalValue",
    "valueStackSavings",
    "valueStackGuarantee",
    "valueStackDeliveryFormat",
    "valueStackProofStatement",
] as const;

// ═══════════════════════════════════════════════════════════
// EMPTY CHECK
// ═══════════════════════════════════════════════════════════

function isEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) {
        if (value.length === 0) return true;
        return value.every((item) => typeof item === "string" && item.trim() === "");
    }
    return false;
}

// ═══════════════════════════════════════════════════════════
// FILTER
// ═══════════════════════════════════════════════════════════

export function filterEmptyValueStackFields(input: Record<string, unknown>): FilterResult {
    const filteredInput: Record<string, unknown> = { ...input };
    const skippedFields: string[] = [];

    for (const field of VALUE_STACK_FIELDS) {
        if (field in filteredInput) {
            if (isEmpty(filteredInput[field])) {
                delete filteredInput[field];
                skippedFields.push(field);
            }
        }
    }

    return { filteredInput, skippedFields };
}
