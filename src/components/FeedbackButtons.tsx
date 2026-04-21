// src/components/FeedbackButtons.tsx
// ═══════════════════════════════════════════════════════════════════════════
// PRO ADS AI — FEEDBACK UI COMPONENT
// Drop this file into: src/components/FeedbackButtons.tsx
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from 'react';
import { feedbackService, type FeedbackRating, type NegativeFeedbackTag } from '../services/feedbackService';
import { auth } from '../firebase';

interface FeedbackButtonsProps {
    generationId: string;
    onRegenerate?: (tags: NegativeFeedbackTag[], freeText: string) => void;
    compact?: boolean;
    showUsedThis?: boolean;
    className?: string;
    initialFavorite?: boolean;
}

const NEGATIVE_TAGS: { id: NegativeFeedbackTag; label: string; icon: string }[] = [
    { id: 'too_generic', label: 'Too Generic', icon: 'fa-meh' },
    { id: 'wrong_tone', label: 'Wrong Tone', icon: 'fa-volume-xmark' },
    { id: 'not_relevant', label: 'Not Relevant', icon: 'fa-bullseye' },
    { id: 'copy_weak', label: 'Copy Weak', icon: 'fa-pen' },
    { id: 'design_off', label: 'Design Off', icon: 'fa-palette' },
    { id: 'too_long', label: 'Too Long', icon: 'fa-expand' },
    { id: 'too_short', label: 'Too Short', icon: 'fa-compress' },
];

export default function FeedbackButtons({
    generationId,
    onRegenerate,
    compact = false,
    showUsedThis = false,
    className = '',
    initialFavorite = false,
}: FeedbackButtonsProps) {
    const [currentRating, setCurrentRating] = useState<FeedbackRating>(null);
    const [showTagPanel, setShowTagPanel] = useState(false);
    const [selectedTags, setSelectedTags] = useState<Set<NegativeFeedbackTag>>(new Set());
    const [freeText, setFreeText] = useState('');
    const [isFavorite, setIsFavorite] = useState(initialFavorite);
    const [submitted, setSubmitted] = useState(false);

    // Reset UI state when the generation changes (new hook/render)
    // Fast-path: seed from initialFavorite for first paint (FR-001 SC-001 zero-flicker
    // target). Authoritative-path: query Firestore per-record for this exact
    // generationId so users with >100 favorites in a phase still see correct state
    // even when their record is outside the per-phase subscription window.
    useEffect(() => {
        setIsFavorite(initialFavorite);
        setShowTagPanel(false);
        setSelectedTags(new Set());
        setFreeText('');
        setSubmitted(false);

        if (!generationId) return;
        let cancelled = false;
        feedbackService.getFavoriteStatus(generationId).then(actual => {
            if (!cancelled) setIsFavorite(actual);
        });
        return () => { cancelled = true; };
    }, [generationId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRate = async (rating: FeedbackRating) => {
        setCurrentRating(rating);
        if (rating === 'negative') {
            setShowTagPanel(true);
            return;
        }
        // Save to Firebase if we have a generationId
        if (generationId) {
            await feedbackService.updateFeedback(generationId, rating);
            // Auto-update user preferences every few ratings
            const uid = auth.currentUser?.uid;
            if (uid) feedbackService.updateUserPreferences(uid).catch(() => { });
        }
        setSubmitted(true);
        setTimeout(() => setSubmitted(false), 2000);
    };

    const handleSubmitNegative = async () => {
        const tags = Array.from(selectedTags);
        if (generationId) {
            await feedbackService.updateFeedback(generationId, 'negative', tags, freeText);
            const uid = auth.currentUser?.uid;
            if (uid) feedbackService.updateUserPreferences(uid).catch(() => { });
        }
        setShowTagPanel(false);
        setSubmitted(true);
        if (onRegenerate) onRegenerate(tags, freeText);
        setTimeout(() => setSubmitted(false), 2000);
    };

    const handleToggleFavorite = async () => {
        const newVal = !isFavorite;
        setIsFavorite(newVal);
        if (generationId) {
            try {
                await feedbackService.toggleFavorite(generationId, newVal);
            } catch (err) {
                console.warn('Failed to toggle favorite:', generationId, err);
                setIsFavorite(!newVal);
            }
        }
    };

    const toggleTag = (tag: NegativeFeedbackTag) => {
        setSelectedTags(prev => {
            const next = new Set(prev);
            if (next.has(tag)) next.delete(tag); else next.add(tag);
            return next;
        });
    };

    // ─── COMPACT MODE (for hook cards) ─────────────────────────────────────
    if (compact) {
        return (
            <div className={`relative flex items-center gap-1.5 ${className}`}>
                <button onClick={() => handleRate('positive')}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] ${currentRating === 'positive' ? 'bg-emerald-600/30 text-emerald-400 scale-110' : 'bg-slate-800/60 text-slate-500 hover:text-emerald-400 hover:bg-emerald-600/10'}`}
                    title="Good output">
                    <i className="fa-solid fa-thumbs-up"></i>
                </button>
                <button onClick={() => handleRate('negative')}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] ${currentRating === 'negative' ? 'bg-red-600/30 text-red-400 scale-110' : 'bg-slate-800/60 text-slate-500 hover:text-red-400 hover:bg-red-600/10'}`}
                    title="Not good">
                    <i className="fa-solid fa-thumbs-down"></i>
                </button>
                <button onClick={handleToggleFavorite}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all text-[11px] ${isFavorite ? 'bg-amber-600/30 text-amber-400' : 'bg-slate-800/60 text-slate-500 hover:text-amber-400 hover:bg-amber-600/10'}`}
                    title="Save to favorites">
                    <i className={`fa-${isFavorite ? 'solid' : 'regular'} fa-bookmark`}></i>
                </button>
                {submitted && <span className="text-[9px] text-emerald-400 font-bold animate-in fade-in zoom-in-95 duration-300"><i className="fa-solid fa-check mr-1"></i>Saved</span>}

                {showTagPanel && (
                    <div className="absolute top-full left-0 mt-2 z-50 bg-slate-950 border border-red-500/20 rounded-2xl p-4 shadow-2xl w-80 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider mb-3">
                            <i className="fa-solid fa-comment-dots mr-1"></i>What went wrong?
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {NEGATIVE_TAGS.map(tag => (
                                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all ${selectedTags.has(tag.id) ? 'bg-red-600/20 text-red-300 border border-red-500/40' : 'bg-slate-800/80 text-slate-400 border border-slate-700/50 hover:border-red-500/30'}`}>
                                    <i className={`fa-solid ${tag.icon} mr-1`}></i>{tag.label}
                                </button>
                            ))}
                        </div>
                        <textarea value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="Optional: tell us more..."
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-[11px] text-slate-300 h-16 resize-none outline-none focus:ring-1 focus:ring-red-500/50 mb-3" />
                        <div className="flex gap-2">
                            <button onClick={handleSubmitNegative}
                                className="flex-1 py-2 rounded-lg bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all">
                                {onRegenerate ? <><i className="fa-solid fa-rotate-right mr-1"></i>Submit & Regenerate</> : <><i className="fa-solid fa-check mr-1"></i>Submit</>}
                            </button>
                            <button onClick={() => { setShowTagPanel(false); setCurrentRating(null); }}
                                className="px-3 py-2 rounded-lg bg-slate-800 text-slate-500 text-[9px] font-bold hover:text-white transition-all">Cancel</button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ─── FULL MODE (for render studio, caption) ────────────────────────────
    return (
        <div className={`relative ${className}`}>
            <div className="flex items-center gap-2 justify-center flex-wrap">
                <button onClick={() => handleRate('positive')}
                    className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-[10px] font-bold uppercase tracking-wider ${currentRating === 'positive' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 scale-105' : 'bg-slate-900/60 border border-slate-700/30 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30'}`}>
                    <i className="fa-solid fa-thumbs-up"></i><span>{currentRating === 'positive' ? 'Liked!' : 'Good'}</span>
                </button>
                <button onClick={() => handleRate('negative')}
                    className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-[10px] font-bold uppercase tracking-wider ${currentRating === 'negative' ? 'bg-red-600/30 text-red-400 border border-red-500/40 scale-105' : 'bg-slate-900/60 border border-slate-700/30 text-slate-400 hover:text-red-400 hover:border-red-500/30'}`}>
                    <i className="fa-solid fa-thumbs-down"></i><span>Needs Work</span>
                </button>
                {showUsedThis && (
                    <button onClick={() => handleRate('used')}
                        className={`px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all text-[10px] font-bold uppercase tracking-wider ${currentRating === 'used' ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40 scale-105' : 'bg-slate-900/60 border border-slate-700/30 text-slate-400 hover:text-blue-400 hover:border-blue-500/30'}`}>
                        <i className="fa-solid fa-rocket"></i><span>{currentRating === 'used' ? 'Marked!' : 'Used This'}</span>
                    </button>
                )}
                <button onClick={handleToggleFavorite}
                    className={`px-3 py-2.5 rounded-xl flex items-center gap-2 transition-all text-[10px] font-bold ${isFavorite ? 'bg-amber-600/30 text-amber-400 border border-amber-500/40' : 'bg-slate-900/60 border border-slate-700/30 text-slate-400 hover:text-amber-400 hover:border-amber-500/30'}`}
                    title="Save to favorites">
                    <i className={`fa-${isFavorite ? 'solid' : 'regular'} fa-bookmark`}></i>
                </button>
                {submitted && <span className="text-[10px] text-emerald-400 font-bold animate-in fade-in zoom-in-95 duration-300 flex items-center gap-1"><i className="fa-solid fa-circle-check"></i>Feedback saved</span>}
            </div>

            {showTagPanel && (
                <div className="mt-4 bg-slate-950 border border-red-500/20 rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
                    <div className="text-[11px] font-bold text-red-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <i className="fa-solid fa-comment-dots"></i>Help the AI learn — what went wrong?
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {NEGATIVE_TAGS.map(tag => (
                            <button key={tag.id} onClick={() => toggleTag(tag.id)}
                                className={`px-3 py-2 rounded-xl text-[10px] font-bold transition-all ${selectedTags.has(tag.id) ? 'bg-red-600/20 text-red-300 border border-red-500/40 shadow-lg shadow-red-500/10' : 'bg-slate-900/80 text-slate-400 border border-slate-700/50 hover:border-red-500/30 hover:text-red-300'}`}>
                                <i className={`fa-solid ${tag.icon} mr-1.5`}></i>{tag.label}
                            </button>
                        ))}
                    </div>
                    <textarea value={freeText} onChange={e => setFreeText(e.target.value)} placeholder="Tell us more about what you'd like to see differently..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-300 h-20 resize-none outline-none focus:ring-1 focus:ring-red-500/50 mb-4" />
                    <div className="flex gap-3">
                        <button onClick={handleSubmitNegative} disabled={selectedTags.size === 0 && !freeText}
                            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-red-600/80 to-red-500/80 hover:from-red-600 hover:to-red-500 text-white text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg flex items-center justify-center gap-2">
                            {onRegenerate ? <><i className="fa-solid fa-rotate-right"></i>Submit & Regenerate</> : <><i className="fa-solid fa-paper-plane"></i>Submit Feedback</>}
                        </button>
                        <button onClick={() => { setShowTagPanel(false); setCurrentRating(null); setSelectedTags(new Set()); setFreeText(''); }}
                            className="px-5 py-3 rounded-xl bg-slate-800 text-slate-400 text-[10px] font-bold uppercase hover:text-white transition-all">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}