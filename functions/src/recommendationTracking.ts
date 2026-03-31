/**
 * recommendationTracking.ts — Ticket 5 (Corrected)
 * ═══════════════════════════════════════════════════════════════════════════
 * Immutable append-only event log for recommendation acceptance/override.
 *
 * Collection: recommendation_events
 * Linkage: requestId + requestFingerprint from Ticket 2
 *
 * Semantic rules:
 *   shown:      recommendedKey required, chosenKey must be null, wasAccepted must be false
 *   accepted:   recommendedKey required, chosenKey required, chosenKey === recommendedKey, wasAccepted must be true
 *   overridden: recommendedKey required, chosenKey required, chosenKey !== recommendedKey, wasAccepted must be false
 *
 * Multi-family shown: familyDecisions[].chosenKey and .wasAccepted are optional/null.
 * Multi-family accepted/overridden: each familyDecision validated per its own wasAccepted flag.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import * as admin from "firebase-admin";
import type { SummaryFamily } from "./patternSummaries.js";

function getDb() { return admin.firestore(); }

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TrackingEventType = 'shown' | 'accepted' | 'overridden';
export type TrackingFamily = 'pair' | 'template' | 'universe_family' | 'hook_angle' | 'multi';

export interface FamilyDecision {
    family: 'pair' | 'template' | 'universe_family' | 'hook_angle';
    recommendedKey: string;
    chosenKey: string | null;
    wasAccepted: boolean | null;
}

export interface RecommendationEvent {
    eventId: string;
    userId: string;
    requestId: string;
    requestFingerprint: string;
    eventType: TrackingEventType;
    family: TrackingFamily;
    recommendedKey: string | null;
    recommendedKeys: string[] | null;
    chosenKey: string | null;
    chosenKeys: string[] | null;
    wasAccepted: boolean;
    familyDecisions: FamilyDecision[] | null;
    idempotencyKey: string | null;
    context: {
        workspaceId?: string;
        niche?: string;
        offerType?: string;
        funnelStage?: string;
        language?: string;
        aspectRatio?: string;
        selectedModes?: string[];
    };
    timestamp: string;
    expiresAt: admin.firestore.Timestamp;
    _storedAt: admin.firestore.FieldValue;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const VALID_EVENT_TYPES = new Set<string>(['shown', 'accepted', 'overridden']);
const VALID_SINGLE_FAMILIES = new Set<string>(['pair', 'template', 'universe_family', 'hook_angle']);
const VALID_FAMILIES = new Set<string>(['pair', 'template', 'universe_family', 'hook_angle', 'multi']);

export interface TrackEventInput {
    requestId: string;
    requestFingerprint: string;
    eventType: string;
    family: string;
    recommendedKey?: string;
    recommendedKeys?: string[];
    chosenKey?: string | null;
    chosenKeys?: string[] | null;
    wasAccepted: boolean;
    familyDecisions?: FamilyDecision[];
    context?: RecommendationEvent['context'];
    idempotencyKey?: string;
}

function validateTrackInput(input: any): { valid: boolean; error?: string } {
    if (!input) return { valid: false, error: 'Input is required' };
    if (typeof input.requestId !== 'string' || !input.requestId) return { valid: false, error: 'requestId is required' };
    if (typeof input.requestFingerprint !== 'string' || !input.requestFingerprint) return { valid: false, error: 'requestFingerprint is required' };
    if (!VALID_EVENT_TYPES.has(input.eventType)) return { valid: false, error: `Invalid eventType: "${input.eventType}". Must be: shown, accepted, overridden` };
    if (!VALID_FAMILIES.has(input.family)) return { valid: false, error: `Invalid family: "${input.family}". Must be: pair, template, universe_family, hook_angle, multi` };
    if (typeof input.wasAccepted !== 'boolean') return { valid: false, error: 'wasAccepted must be a boolean' };

    const et = input.eventType as TrackingEventType;

    if (input.family !== 'multi') {
        return validateSingleFamily(input, et);
    } else {
        return validateMultiFamily(input, et);
    }
}

function validateSingleFamily(input: any, et: TrackingEventType): { valid: boolean; error?: string } {
    if (!VALID_SINGLE_FAMILIES.has(input.family)) {
        return { valid: false, error: `Invalid single family: "${input.family}"` };
    }

    if (et === 'shown') {
        if (typeof input.recommendedKey !== 'string' || !input.recommendedKey) return { valid: false, error: 'shown: recommendedKey is required' };
        if (input.chosenKey != null) return { valid: false, error: 'shown: chosenKey must be null/absent' };
        if (input.wasAccepted !== false) return { valid: false, error: 'shown: wasAccepted must be false' };
    } else if (et === 'accepted') {
        if (typeof input.recommendedKey !== 'string' || !input.recommendedKey) return { valid: false, error: 'accepted: recommendedKey is required' };
        if (typeof input.chosenKey !== 'string' || !input.chosenKey) return { valid: false, error: 'accepted: chosenKey is required' };
        if (input.chosenKey !== input.recommendedKey) return { valid: false, error: 'accepted: chosenKey must equal recommendedKey' };
        if (input.wasAccepted !== true) return { valid: false, error: 'accepted: wasAccepted must be true' };
    } else if (et === 'overridden') {
        if (typeof input.recommendedKey !== 'string' || !input.recommendedKey) return { valid: false, error: 'overridden: recommendedKey is required' };
        if (typeof input.chosenKey !== 'string' || !input.chosenKey) return { valid: false, error: 'overridden: chosenKey is required' };
        if (input.chosenKey === input.recommendedKey) return { valid: false, error: 'overridden: chosenKey must differ from recommendedKey' };
        if (input.wasAccepted !== false) return { valid: false, error: 'overridden: wasAccepted must be false' };
    }

    return { valid: true };
}

function validateMultiFamily(input: any, et: TrackingEventType): { valid: boolean; error?: string } {
    // Fix #1: enforce top-level wasAccepted against eventType
    if (et === 'shown' && input.wasAccepted !== false) {
        return { valid: false, error: 'multi shown: wasAccepted must be false' };
    }
    if (et === 'accepted' && input.wasAccepted !== true) {
        return { valid: false, error: 'multi accepted: wasAccepted must be true' };
    }
    if (et === 'overridden' && input.wasAccepted !== false) {
        return { valid: false, error: 'multi overridden: wasAccepted must be false' };
    }

    if (!Array.isArray(input.familyDecisions) || input.familyDecisions.length === 0) {
        return { valid: false, error: 'multi: familyDecisions is required and must be non-empty' };
    }

    for (let i = 0; i < input.familyDecisions.length; i++) {
        const fd = input.familyDecisions[i];
        if (!fd || !VALID_SINGLE_FAMILIES.has(fd.family)) {
            return { valid: false, error: `familyDecisions[${i}].family is invalid` };
        }
        if (typeof fd.recommendedKey !== 'string' || !fd.recommendedKey) {
            return { valid: false, error: `familyDecisions[${i}].recommendedKey is required` };
        }

        if (et === 'shown') {
            if (fd.chosenKey != null) {
                return { valid: false, error: `familyDecisions[${i}].chosenKey must be null/absent for shown events` };
            }
            if (fd.wasAccepted != null && fd.wasAccepted !== false) {
                return { valid: false, error: `familyDecisions[${i}].wasAccepted must be null/false for shown events` };
            }
        } else if (et === 'accepted') {
            // Every family decision must be accepted — no mixed outcomes
            if (fd.wasAccepted !== true) {
                return { valid: false, error: `familyDecisions[${i}].wasAccepted must be true for accepted events` };
            }
            if (typeof fd.chosenKey !== 'string' || !fd.chosenKey) {
                return { valid: false, error: `familyDecisions[${i}].chosenKey is required for accepted events` };
            }
            if (fd.chosenKey !== fd.recommendedKey) {
                return { valid: false, error: `familyDecisions[${i}].chosenKey must equal recommendedKey for accepted events` };
            }
        } else if (et === 'overridden') {
            // Every family decision must be overridden — no mixed outcomes
            if (fd.wasAccepted !== false) {
                return { valid: false, error: `familyDecisions[${i}].wasAccepted must be false for overridden events` };
            }
            if (typeof fd.chosenKey !== 'string' || !fd.chosenKey) {
                return { valid: false, error: `familyDecisions[${i}].chosenKey is required for overridden events` };
            }
            if (fd.chosenKey === fd.recommendedKey) {
                return { valid: false, error: `familyDecisions[${i}].chosenKey must differ from recommendedKey for overridden events` };
            }
        }
    }

    return { valid: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// WRITE — Append-only event
// ═══════════════════════════════════════════════════════════════════════════

const RETENTION_DAYS = 90;

export async function trackRecommendationEvent(
    userId: string,
    input: TrackEventInput,
): Promise<{ eventId: string; deduplicated: boolean }> {
    // Idempotency: if caller provides a key, use deterministic doc ID
    const idemKey = input.idempotencyKey && typeof input.idempotencyKey === 'string' && input.idempotencyKey.trim()
        ? input.idempotencyKey.trim() : null;

    let eventId: string;
    if (idemKey) {
        eventId = `evt_${userId}_idem_${idemKey}`;
        // Check if already exists
        const existing = await getDb().collection('recommendation_events').doc(eventId).get();
        if (existing.exists) {
            return { eventId, deduplicated: true };
        }
    } else {
        eventId = `evt_${userId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    }

    const now = new Date();
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(now.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000));

    const event: RecommendationEvent = {
        eventId,
        userId,
        requestId: input.requestId,
        requestFingerprint: input.requestFingerprint,
        eventType: input.eventType as TrackingEventType,
        family: input.family as TrackingFamily,
        recommendedKey: input.recommendedKey || null,
        recommendedKeys: input.recommendedKeys || null,
        chosenKey: input.chosenKey || null,
        chosenKeys: input.chosenKeys || null,
        wasAccepted: input.wasAccepted,
        familyDecisions: input.familyDecisions || null,
        idempotencyKey: idemKey,
        context: input.context || {},
        timestamp: now.toISOString(),
        expiresAt,
        _storedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await getDb().collection('recommendation_events').doc(eventId).set(event);
    return { eventId, deduplicated: false };
}

// ═══════════════════════════════════════════════════════════════════════════
// READ — Narrow audit/debug queries
// ═══════════════════════════════════════════════════════════════════════════

export interface ReadEventsInput {
    requestId?: string;
    limit?: number;
}

function validateReadInput(input: any): { valid: boolean; error?: string; parsed: ReadEventsInput } {
    const parsed: ReadEventsInput = {};
    if (input == null) return { valid: true, parsed };

    if (input.requestId !== undefined) {
        if (typeof input.requestId !== 'string' || !input.requestId.trim()) {
            return { valid: false, error: 'requestId must be a non-empty string if provided', parsed };
        }
        parsed.requestId = input.requestId.trim();
    }

    if (input.limit !== undefined) {
        const lim = Number(input.limit);
        if (!Number.isInteger(lim) || lim < 1) {
            return { valid: false, error: 'limit must be a positive integer if provided', parsed };
        }
        parsed.limit = lim;
    }

    return { valid: true, parsed };
}

export async function getRecommendationEvents(
    userId: string,
    input: ReadEventsInput,
): Promise<RecommendationEvent[]> {
    const maxResults = Math.min(input.limit || 50, 100);

    let q: FirebaseFirestore.Query = getDb().collection('recommendation_events')
        .where('userId', '==', userId);

    if (input.requestId) {
        q = q.where('requestId', '==', input.requestId);
    }

    q = q.orderBy('_storedAt', 'desc').limit(maxResults);

    const snap = await q.get();
    return snap.docs.map(d => d.data() as RecommendationEvent);
}

export { validateTrackInput, validateReadInput };