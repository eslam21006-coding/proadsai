// testimonialMockup.ts — Platform detection and mockup rendering for testimonial carousels

import type { PlatformType, VisualStyleFamily } from "./types.js";

type GeminiCaller = (params: { model: string; contents: any; config?: any }) => Promise<any>;
let callGemini: GeminiCaller;

export function setTestimonialGeminiCaller(fn: GeminiCaller) {
    callGemini = fn;
}

const VISUAL_MODEL = "gemini-3.1-flash-image-preview";

const PLATFORM_PROMPT = `You are a messaging platform identifier. Look at this screenshot and determine which messaging platform it comes from.

Respond with exactly one of these words:
- whatsapp (green header, chat bubbles, timestamps, double check marks)
- instagram_dm (Instagram interface, username visible, heart/message icons)
- facebook (blue header, comment card style, reaction icons)
- email (inbox card view, subject line, sender/recipient fields)
- google_review (star rating, reviewer name, review text card)
- telegram (Telegram blue chrome, message bubbles, username)
- unknown (none of the above or ambiguous)

Respond with ONLY the platform name, nothing else.`;

const MOCKUP_PROMPTS: Record<PlatformType, string> = {
    whatsapp: `Render this testimonial screenshot inside a WhatsApp-style UI frame. Show a green header bar with the contact name, chat bubbles wrapping the screenshot content, and timestamps. The frame should look like an authentic WhatsApp conversation on a phone screen. Keep the original testimonial text readable.`,
    instagram_dm: `Render this testimonial screenshot inside an Instagram DM-style UI frame. Show the Instagram top bar with username, a message bubble containing the screenshot content, and the heart/message bar at the bottom. The frame should look like an authentic Instagram DM on a phone screen. Keep the original testimonial text readable.`,
    facebook: `Render this testimonial screenshot inside a Facebook comment-style UI frame. Show a blue header bar, a comment card with the screenshot content, reaction icons below (like, love, etc), and a commenter avatar placeholder. The frame should look authentic. Keep the original testimonial text readable.`,
    email: `Render this testimonial screenshot inside an email inbox card-style UI frame. Show sender field, subject line, date/time, and the email body containing the screenshot content. Clean professional email layout. Keep the original testimonial text readable.`,
    google_review: `Render this testimonial screenshot inside a Google Review card-style UI frame. Show 5 gold stars (filled based on screenshot), reviewer name with avatar placeholder, review date, and the review text from the screenshot. Google-style card with rounded corners. Keep the original testimonial text readable.`,
    telegram: `Render this testimonial screenshot inside a Telegram-style UI frame. Show Telegram blue header with contact name, message bubbles with the screenshot content, and timestamps. The frame should look like an authentic Telegram conversation. Keep the original testimonial text readable.`,
    unknown: `Render this testimonial screenshot inside a clean quote card UI frame. Show a large quotation mark icon at top, the screenshot content centered in the card, an avatar placeholder circle, and a decorative bottom border. Clean modern card design with subtle shadow. Keep the original testimonial text readable.`,
};

export async function detectTestimonialPlatform(screenshotBase64: string): Promise<PlatformType> {
    try {
        const rawB64 = screenshotBase64.includes(",") ? screenshotBase64.split(",")[1] : screenshotBase64;
        const mime = screenshotBase64.startsWith("data:image/webp") ? "image/webp"
            : screenshotBase64.startsWith("data:image/png") ? "image/png"
            : "image/jpeg";

        const response = await callGemini({
            model: VISUAL_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: mime, data: rawB64 } },
                    { text: PLATFORM_PROMPT },
                ],
            },
            config: { temperature: 0.1 },
        });

        const text = (response.text || "").trim().toLowerCase();
        const validPlatforms: PlatformType[] = ["whatsapp", "instagram_dm", "facebook", "email", "google_review", "telegram", "unknown"];
        const match = validPlatforms.find((p) => text.includes(p));
        return match || "unknown";
    } catch (e) {
        console.warn("⚠️ detectTestimonialPlatform failed, defaulting to unknown:", e);
        return "unknown";
    }
}

export async function buildTestimonialMockup(
    screenshotBase64: string,
    platform: PlatformType,
    visualStyleFamily: VisualStyleFamily = "realistic",
): Promise<string> {
    try {
        const rawB64 = screenshotBase64.includes(",") ? screenshotBase64.split(",")[1] : screenshotBase64;
        const mime = screenshotBase64.startsWith("data:image/webp") ? "image/webp"
            : screenshotBase64.startsWith("data:image/png") ? "image/png"
            : "image/jpeg";

        const styleClause =
            visualStyleFamily === "minimal" ? "Clean, minimal, commercial. No background scenes or decorative environments."
            : visualStyleFamily === "fantasy" ? "Stylized cinematic palette consistent with fantasy art direction."
            : "Realistic, professional commercial style.";
        const mockupPrompt = `${MOCKUP_PROMPTS[platform]}\n\nVISUAL STYLE: ${styleClause} Maintain identical palette, lighting, and framing across all slides in this carousel for art-direction consistency.`;

        const response = await callGemini({
            model: VISUAL_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: mime, data: rawB64 } },
                    { text: mockupPrompt },
                ],
            },
            config: {
                responseModalities: ["TEXT", "IMAGE"],
                safetySettings: [
                    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
                    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
                ],
            },
        });

        for (const cand of response.candidates || []) {
            if (cand.content && cand.content.parts) {
                for (const part of cand.content.parts) {
                    if (part.inlineData) {
                        return `data:image/png;base64,${part.inlineData.data}`;
                    }
                }
            }
        }

        console.warn("⚠️ buildTestimonialMockup: no image returned, using raw screenshot");
        return screenshotBase64;
    } catch (e) {
        console.warn("⚠️ buildTestimonialMockup failed, using raw screenshot:", e);
        return screenshotBase64;
    }
}
