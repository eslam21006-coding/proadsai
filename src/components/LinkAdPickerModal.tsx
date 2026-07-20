// src/components/LinkAdPickerModal.tsx
// Phase 14 Layer 5 — Section E picker. When the user clicks "Link"
// on an unmatched ad in the What's Working dashboard, this modal
// opens showing recent Pro Ads AI generations from the SAME workspace
// (FR-023 — cross-workspace linking is FORBIDDEN).
// NO technical terms in the UI (FR-019, SC-11).

import React, { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";
import { useT } from "../i18n";

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

export function LinkAdPickerModal(props: LinkAdPickerModalProps): React.ReactElement | null {
    const { t } = useT();
    const [generations, setGenerations] = useState<GenerationSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [linking, setLinking] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!props.open) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        (async () => {
            try {
                // FR-023: only the active workspace's generations.
                // The query filters by workspaceId AND a non-null
                // imageFingerprint (so we know we have a renderable image).
                // Firestore requires the first orderBy field to match the
                // inequality-filter field, so order first by imageFingerprint,
                // then by createdAt desc.
                const q = query(
                    collection(db, "generations"),
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
                if (!cancelled) setError((e as Error).message ?? "unknown");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [props.open, props.workspaceId]);

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
            setError((e as Error).message ?? "unknown");
        } finally {
            setLinking(null);
        }
    }

    return (
        <div
            className="fixed inset-0 z-[300] flex items-center justify-center p-4"
            onClick={props.onClose}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="link-ad-picker-title"
                className="relative bg-slate-950 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl max-h-[90vh] flex flex-col"
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
                            {t("whats_working.unmatched.empty")}
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
                                        {g.hookAngle ? g.hookAngle.replace(/_/g, " ") : "—"}
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
