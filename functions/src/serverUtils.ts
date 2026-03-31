// Server-side utilities replacing browser APIs

import * as admin from "firebase-admin";

function getDb() { return admin.firestore(); }

/**
 * Fetch website metadata (server-side equivalent of browser DOMParser approach)
 */
export async function fetchWebsiteContext(url: string): Promise<string> {
    if (!url || !url.startsWith('http')) return '';
    try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok) return '';
        const html = await response.text();

        // Simple regex-based extraction (no DOMParser on server)
        const getTag = (tag: string): string => {
            const m = html.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
            return m ? m[1].trim() : '';
        };
        const getMeta = (attr: string, val: string): string => {
            const m = html.match(new RegExp(`<meta[^>]*${attr}=["']${val}["'][^>]*content=["']([^"']+)["']`, 'i'))
                || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${val}["']`, 'i'));
            return m ? m[1].trim() : '';
        };

        const title = getTag('title');
        const h1 = getTag('h1');
        const metaDesc = getMeta('name', 'description');
        const ogDesc = getMeta('property', 'og:description');
        const ogTitle = getMeta('property', 'og:title');
        const keywords = getMeta('name', 'keywords');
        const description = metaDesc || ogDesc || '';
        const pageTitle = ogTitle || title || '';

        if (!pageTitle && !description && !h1) return '';
        return `
WEBSITE ANALYSIS (scraped from ${url}):
- Page Title: ${pageTitle}
- Main Heading: ${h1}
- Description: ${description}
${keywords ? `- Keywords: ${keywords}` : ''}
Use this information to better understand the brand's positioning, tone, and target audience.`;
    } catch {
        return '';
    }
}

/**
 * Build personalization context from Firestore feedback data (server-side)
 */
export async function buildPersonalizationContext(
    userId: string,
    phase: string = 'hooks',
    niche?: string
): Promise<string> {
    const contextParts: string[] = [];
    try {
        // Get user's generation feedback — query the correct field path and enum values
        // Client stores feedback under 'feedback.rating' with values 'positive'/'negative'/'used'
        const gensRef = getDb().collection('generations')
            .where('userId', '==', userId)
            .where('feedback.rating', 'in', ['positive', 'negative', 'used'])
            .orderBy('timestamp', 'desc')
            .limit(50);
        const gensSnap = await gensRef.get();

        if (gensSnap.size < 5) return ''; // Not enough data

        const liked = gensSnap.docs.filter(d => {
            const rating = d.data().feedback?.rating;
            return rating === 'positive' || rating === 'used';
        });
        const disliked = gensSnap.docs.filter(d => d.data().feedback?.rating === 'negative');

        // Avoid patterns from disliked
        if (disliked.length > 0) {
            const tags = disliked.flatMap(d => d.data().feedback?.tags || []);
            const tagCounts: Record<string, number> = {};
            tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
            const topAvoid = Object.entries(tagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([tag]) => tag);
            if (topAvoid.length > 0) {
                const avoidMap: Record<string, string> = {
                    'too_generic': 'generic/safe approaches',
                    'wrong_tone': 'mismatched tone',
                    'not_relevant': 'off-target messaging',
                    'design_off': 'poor visual direction',
                    'copy_weak': 'weak/unconvincing copy',
                    'too_long': 'lengthy text',
                    'too_short': 'overly brief text',
                };
                contextParts.push(`USER DISLIKES: ${topAvoid.map(t => avoidMap[t] || t).join(', ')}`);
            }
        }

        // Winning Principles Vault — structural principles only, no raw examples
        try {
            const { buildVaultBlock } = await import("./principleVault.js");
            const vaultBlock = await buildVaultBlock(userId, phase, niche);
            if (vaultBlock) {
                contextParts.push(vaultBlock);
            }
        } catch (vaultErr) {
            console.warn('[serverUtils] Vault block failed (non-blocking):', vaultErr);
            // No fallback to raw examples — they cause the model to copy exact phrasing
        }

        // Ad performance data
        const perfSnap = await getDb().collection('adPerformance')
            .where('userId', '==', userId)
            .orderBy('syncedAt', 'desc')
            .limit(20)
            .get();

        if (perfSnap.size > 0) {
            const records = perfSnap.docs.map(d => d.data());
            const totalClicks = records.reduce((s, r) => s + (r.clicks || 0), 0);
            const totalImpressions = records.reduce((s, r) => s + (r.impressions || 0), 0);
            const avgCtr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0';
            const totalSpend = records.reduce((s, r) => s + (r.spend || 0), 0);

            const perfLines: string[] = [];
            perfLines.push(`- ${perfSnap.size} ads tracked, avg CTR: ${avgCtr}%, total spend: $${totalSpend.toFixed(0)}`);

            // Find top performers for guidance
            const sortedByCtr = [...records].sort((a, b) => (b.ctr || 0) - (a.ctr || 0));
            const topAds = sortedByCtr.slice(0, 3).filter(a => (a.ctr || 0) > 0);
            if (topAds.length > 0) {
                perfLines.push(`- Top ads by CTR:`);
                topAds.forEach((ad, i) => {
                    perfLines.push(`  ${i + 1}. "${ad.adName}" — CTR: ${(ad.ctr || 0).toFixed(2)}%`);
                });
            }

            contextParts.push(`AD PERFORMANCE:\n${perfLines.join('\n')}`);
        }

        // ═══ DIMENSIONAL PERFORMANCE LEARNING ═══
        // Read from creativeDeployments to learn which creative dimensions perform best
        try {
            const depSnap = await getDb().collection('creativeDeployments')
                .where('userId', '==', userId)
                .orderBy('pushedAt', 'desc')
                .limit(50)
                .get();

            if (depSnap.size >= 3) {
                const deps = depSnap.docs.map(d => d.data()).filter(d => d.latestMetrics?.ctr > 0);

                if (deps.length >= 3) {
                    const dimInsights: string[] = [];

                    // Analyze by hook angle
                    const byAngle: Record<string, { total: number; ctrSum: number }> = {};
                    deps.forEach(d => {
                        const angle = d.hookMetadata?.angle;
                        if (angle) {
                            if (!byAngle[angle]) byAngle[angle] = { total: 0, ctrSum: 0 };
                            byAngle[angle].total++;
                            byAngle[angle].ctrSum += d.latestMetrics.ctr || 0;
                        }
                    });
                    const angleEntries = Object.entries(byAngle).filter(([, v]) => v.total >= 2).sort((a, b) => (b[1].ctrSum / b[1].total) - (a[1].ctrSum / a[1].total));
                    if (angleEntries.length > 0) {
                        const best = angleEntries[0];
                        dimInsights.push(`Best performing hook angle: "${best[0]}" (avg CTR: ${(best[1].ctrSum / best[1].total).toFixed(2)}% across ${best[1].total} ads)`);
                    }

                    // Analyze by ratio
                    const byRatio: Record<string, { total: number; ctrSum: number }> = {};
                    deps.forEach(d => {
                        const ratio = d.ratio;
                        if (ratio) {
                            if (!byRatio[ratio]) byRatio[ratio] = { total: 0, ctrSum: 0 };
                            byRatio[ratio].total++;
                            byRatio[ratio].ctrSum += d.latestMetrics.ctr || 0;
                        }
                    });
                    const ratioEntries = Object.entries(byRatio).filter(([, v]) => v.total >= 2).sort((a, b) => (b[1].ctrSum / b[1].total) - (a[1].ctrSum / a[1].total));
                    if (ratioEntries.length > 0) {
                        const best = ratioEntries[0];
                        dimInsights.push(`Best performing format: ${best[0]} (avg CTR: ${(best[1].ctrSum / best[1].total).toFixed(2)}%)`);
                    }

                    // Analyze by mode (single vs carousel vs batch)
                    const byMode: Record<string, { total: number; ctrSum: number }> = {};
                    deps.forEach(d => {
                        const mode = d.mode || 'single';
                        if (!byMode[mode]) byMode[mode] = { total: 0, ctrSum: 0 };
                        byMode[mode].total++;
                        byMode[mode].ctrSum += d.latestMetrics.ctr || 0;
                    });
                    const modeEntries = Object.entries(byMode).filter(([, v]) => v.total >= 2).sort((a, b) => (b[1].ctrSum / b[1].total) - (a[1].ctrSum / a[1].total));
                    if (modeEntries.length > 0) {
                        const best = modeEntries[0];
                        dimInsights.push(`Best performing ad mode: ${best[0]} (avg CTR: ${(best[1].ctrSum / best[1].total).toFixed(2)}%)`);
                    }

                    if (dimInsights.length > 0) {
                        contextParts.push(`CREATIVE INTELLIGENCE (from ${deps.length} tracked deployments):\n${dimInsights.map(i => `- ${i}`).join('\n')}`);
                    }
                }
            }
        } catch {
            // Non-blocking — dimensional learning is a bonus
        }
    } catch (e) {
        // Non-blocking — personalization is an enhancement
        console.warn('Personalization context build failed (non-blocking):', e);
    }

    return contextParts.length > 0
        ? `\n═══ PERSONALIZATION (from user history) ═══\n${contextParts.join('\n')}\n═══════════════════════════════════════════`
        : '';
}