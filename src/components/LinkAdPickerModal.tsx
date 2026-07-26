// src/components/LinkAdPickerModal.tsx
// Phase 14 Layer 5 — Section E picker. When the user clicks "Link"
// on an unmatched ad in the What's Working dashboard, this modal
// opens showing recent Pro Ads AI generations from the SAME workspace
// (FR-023 — cross-workspace linking is FORBIDDEN).
// NO technical terms in the UI (FR-019, SC-11).

import React, { useEffect, useRef, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { auth } from "../firebase";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { useT } from "../i18n";
import { COLD_HOOK_ANGLES } from "../constants";

// Localized hook-angle labels keyed by canonical id (e.g. `social_proof`).
// Rendering the raw id (even with underscores replaced) leaves English in
// the Arabic UI, so resolve it through the shared catalog.
const HOOK_ANGLE_LABELS: Record<string, { labelAr: string; labelEn: string }> =
    Object.fromEntries(COLD_HOOK_ANGLES.map((a) => [a.id, { labelAr: a.labelAr, labelEn: a.labelEn }]));

interface GenerationSummary {
    id: string;
    hookAngle: string | null;
    thumbnailUrl: string | null;
    createdAt: number;
}

interface LinkAdPickerModalProps {
    open: boolean;
    workspaceId: string;
    accountId: string;
    adId: string;
    adName: string;
    onClose: () => void;
    onLinked: () => void;
}

// Focusable-element selector for the focus trap.
const FOCUSABLE_SELECTOR =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function LinkAdPickerModal(props: LinkAdPickerModalProps): React.ReactElement | null {
    const { t, lang } = useT();
    const [generations, setGenerations] = useState<GenerationSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Focus management refs (a11y — keyboard-operable modal).
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const previouslyFocusedRef = useRef<HTMLElement | null>(null);
    // Keep the latest onClose without re-running the focus effect each render
    // (the parent passes a fresh arrow every render).
    const onCloseRef = useRef(props.onClose);
    useEffect(() => { onCloseRef.current = props.onClose; }, [props.onClose]);

    useEffect(() => {
        if (!props.open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                // FIX 5 (dashboard-polish): the `generations` security rule
                // only allows reads where `userId == request.auth.uid`.
                // Firestore rejects a query it can't prove satisfies that
                // rule, so the query MUST constrain userId — without it the
                // client got "Missing or insufficient permissions". (The
                // rule itself was already correct; the query was the gap.)
                const uid = auth.currentUser?.uid;
                if (!uid) {
                    setGenerations([]);
                    return;
                }
                // FR-023: only the active workspace's generations.
                // The query filters by userId AND workspaceId AND a non-null
                // imageFingerprint (so we know we have a renderable image).
                // Firestore requires the first orderBy field to match the
                // inequality-filter field, so order first by imageFingerprint,
                // then by timestamp desc.
                const q = query(
                    collection(db, "generations"),
                    where("userId", "==", uid),
                    where("workspaceId", "==", props.workspaceId),
                    where("imageFingerprint", "!=", null),
                    orderBy("imageFingerprint", "desc"),
                    orderBy("timestamp", "desc"),
                    limit(30),
                );
                const snap = await getDocs(q);
                if (cancelled) return;
                const items: GenerationSummary[] = snap.docs.map((d) => {
                    const data = d.data();
                    // Generation docs use Firestore Timestamp on the 'timestamp' field
                    // (see feedbackService.saveGeneration: timestamp: Timestamp.now()).
                    // Fall back to a millisecond epoch if the field is already
                    // a number on older docs.
                    const createdAt =
                        typeof data.timestamp?.toMillis === "function"
                            ? data.timestamp.toMillis()
                            : typeof data.timestamp === "number"
                                ? data.timestamp
                                : typeof data.createdAt === "number"
                                    ? data.createdAt
                                    : Date.now();
                    const hookAngleRaw = (data.input && typeof data.input.coldHookAngle === "string")
                        ? data.input.coldHookAngle
                        : (typeof data.hookAngle === "string" ? data.hookAngle : null);
                    const imageUrl =
                        (data.output && typeof data.output.imageUrl === "string")
                            ? data.output.imageUrl
                            : (typeof data.storageUrl === "string" ? data.storageUrl : null);
                    return {
                        id: d.id,
                        hookAngle: hookAngleRaw,
                        thumbnailUrl: imageUrl,
                        createdAt,
                    };
                });
                setGenerations(items);
            } catch (e) {
                // Never surface a raw Firebase/Firestore error to the user —
                // it can leak internals and bypasses localization. Log it,
                // show a localized generic message.
                console.warn("LinkAdPicker: failed to load generations:", e);
                if (!cancelled) setError(t("whats_working.link_picker.load_error"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [props.open, props.workspaceId, t]);

    // Keyboard-operable modal: move focus in on open, trap Tab inside the
    // dialog, close on Escape, and restore focus to the triggering element
    // on close.
    useEffect(() => {
        if (!props.open) return;
        previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
        const dialog = dialogRef.current;
        const focusables = (): HTMLElement[] =>
            dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)) : [];
        focusables()[0]?.focus();

        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") {
                onCloseRef.current();
                return;
            }
            if (e.key !== "Tab") return;
            const items = focusables();
            const active = document.activeElement as HTMLElement | null;
            if (items.length === 0 || !dialog?.contains(active)) {
                e.preventDefault();
                dialog?.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey) {
                if (active === first) { e.preventDefault(); last.focus(); }
            } else {
                if (active === last) { e.preventDefault(); first.focus(); }
            }
        }

        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            previouslyFocusedRef.current?.focus?.();
            previouslyFocusedRef.current = null;
        };
    }, [props.open]);

    if (!props.open) return null;

    async function linkTo(adId: string, generationId: string) {
        if (linking) return;
        setLinking(generationId);
        setError(null);
        try {
            const fn = httpsCallable(functions, "linkUnmatchedAd");
            await fn({
                workspaceId: props.workspaceId,
                accountId: props.accountId,
                adId: props.adId,
                generationId,
            });
            props.onLinked();
            props.onClose();
        } catch (e) {
            // Localized generic message instead of the raw callable error.
            console.warn("LinkAdPicker: failed to link ad:", e);
            setError(t("whats_working.link_picker.link_error"));
        } finally {
            setLinking(null);
        }
    }

    const hookLabel = (id: string | null): string => {
        if (!id) return "—";
        const entry = HOOK_ANGLE_LABELS[id];
        if (entry) return lang === "ar" ? entry.labelAr : entry.labelEn;
        return id.replace(/_/g, " ");
    };

    return (
        // The opaque dark overlay lives on the fixed full-screen div itself
        // (z above the What's Working dashboard at z-[200]) so no page or
        // dashboard content shows through. The panel below is a solid card.
        <div
            className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={props.onClose}
        >
            {/* Solid dark panel — this modal is opened from inside the
                always-dark What's Working dashboard, and its content
                (white headings, slate borders, blue gradient) is built for
                a dark surface. The app manages theme via explicit classes,
                not Tailwind's `dark:` variant, so we keep the panel solid
                dark rather than a theme-conditional white. */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="link-ad-picker-title"
                tabIndex={-1}
                className="relative bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col focus:outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-gradient-to-b from-blue-900/20 to-transparent p-6 pb-4 border-b border-slate-800 shrink-0">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 id="link-ad-picker-title" className="text-lg font-black text-white">
                                <i className="fa-solid fa-link text-blue-400 mr-2" />
                                {t("whats_working.unmatched.title")}
                            </h2>
                            <div className="mt-1 text-[10px] text-slate-400 truncate max-w-md">
                                {props.adName}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={props.onClose}
                            aria-label={t("common.close")}
                            className="text-slate-500 hover:text-white transition-all"
                        >
                            <i className="fa-solid fa-xmark text-lg" aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {loading ? (
                        <div className="text-center text-slate-400 text-sm py-10">
                            <i className="fa-solid fa-spinner fa-spin mr-2" />
                            {t("loading")}
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                            {error}
                        </div>
                    ) : generations.length === 0 ? (
                        <div className="text-slate-500 text-sm italic text-center py-10">
                            {t("whats_working.link_picker.empty")}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 gap-3">
                            {generations.map((g) => (
                                <button
                                    key={g.id}
                                    onClick={() => void linkTo(props.adId, g.id)}
                                    disabled={linking !== null}
                                    className="bg-slate-900/40 border border-slate-800/40 hover:border-blue-500/40 hover:bg-blue-500/10 rounded-xl p-2 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <div className="aspect-square bg-slate-950 rounded-lg mb-2 overflow-hidden border border-slate-800/40">
                                        {g.thumbnailUrl ? (
                                            <img
                                                src={g.thumbnailUrl}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-700 text-2xl">
                                                <i className="fa-solid fa-image" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-[9px] text-slate-300 truncate font-bold">
                                        {hookLabel(g.hookAngle)}
                                    </div>
                                    <div className="text-[8px] text-slate-500 mt-0.5">
                                        {linking === g.id ? (
                                            <span className="text-blue-400">
                                                <i className="fa-solid fa-spinner fa-spin mr-1" />
                                                {t("loading")}
                                            </span>
                                        ) : (
                                            t("whats_working.unmatched.link_cta")
                                        )}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
