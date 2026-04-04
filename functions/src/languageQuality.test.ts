// functions/src/languageQuality.test.ts — per-language caption quality contract tests (Spec 008)

import assert from "node:assert/strict";
import {
    validateLanguageQuality,
    checkHeadlineWordCount,
    checkSubheadlineWordCount,
    checkArabicUnicodeRatio,
    checkHangingConjunction,
    checkWeakOpener,
    checkDialectMarkers,
    checkWarmthRegister,
    checkCapitalization,
    checkNoRepeatedWords,
    checkCompleteSentence,
    checkCtaClarity,
    checkNoFillerPhrases,
} from "./captionValidator.js";

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeInput(
    headline: string,
    subheadline: string,
    locale: string,
    fullCaption?: string,
) {
    return {
        headline,
        subheadline,
        locale,
        fullCaption: fullCaption || `${headline} ${subheadline}`,
    };
}

function assertAllPass(locale: string, headline: string, subheadline: string, fullCaption?: string) {
    const result = validateLanguageQuality(makeInput(headline, subheadline, locale, fullCaption));
    assert.equal(result.passed, true, `${locale} pass: expected passed=true, got fails: ${result.checks.filter(c => !c.passed).map(c => c.rule).join(", ")}`);
    for (const check of result.checks) {
        assert.equal(check.passed, true, `${locale} check ${check.rule}: ${check.detail}`);
    }
}

function assertFailsWithRule(locale: string, headline: string, subheadline: string, expectedRule: string, fullCaption?: string) {
    const result = validateLanguageQuality(makeInput(headline, subheadline, locale, fullCaption));
    assert.equal(result.passed, false, `${locale} fail: expected passed=false for ${expectedRule}`);
    const failed = result.checks.find(c => c.rule === expectedRule && !c.passed);
    assert.ok(failed, `${locale} fail: expected rule ${expectedRule} to fail`);
}

// ═══════════════════════════════════════════════════════════════════════════
// US1: ar_fusha TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArFushaPass() {
    assertAllPass(
        "ar_fusha",
        "عرض حصري لك",
        "احصل على خصم خاص اليوم فقط لا تفوت الفرصة",
    );
    console.log("  ✅ testArFushaPass");
}

function testArFushaWordCountFail() {
    const longHeadline = "هذا عنوان طويل جدا يتجاوز الحد المسموح به لعدد الكلمات المطلوب";
    assertFailsWithRule("ar_fusha", longHeadline, "نص ثانوي", "headline_word_count");
    console.log("  ✅ testArFushaWordCountFail");
}

function testArFushaHangingConjunctionFail() {
    assertFailsWithRule("ar_fusha", "عرض خاص و", "نص ثانوي جيد", "hanging_conjunction");
    console.log("  ✅ testArFushaHangingConjunctionFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US2: ar_egyptian TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArEgyptianPass() {
    assertAllPass(
        "ar_egyptian",
        "عندك عرض جامد",
        "يلا بينا نحقق حلمك ده النهاردة",
    );
    console.log("  ✅ testArEgyptianPass");
}

function testArEgyptianWordCountFail() {
    const longHeadline = "عندك عرض جامد جدا ومش هتلاقي زي ده في أي مكان تاني صح";
    assertFailsWithRule("ar_egyptian", longHeadline, "يلا بينا", "headline_word_count");
    console.log("  ✅ testArEgyptianWordCountFail");
}

function testArEgyptianDialectMarkerFail() {
    assertFailsWithRule(
        "ar_egyptian",
        "عرض حلو",
        "السعر زين",
        "dialect_markers",
        "عرض حلو والسعر زين",
    );
    console.log("  ✅ testArEgyptianDialectMarkerFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US3: ar_gulf TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArGulfPass() {
    assertAllPass(
        "ar_gulf",
        "عرض مميز لكم",
        "احصل على أفضل العروض الحين",
    );
    console.log("  ✅ testArGulfPass");
}

function testArGulfWordCountFail() {
    const longHeadline = "عندنا عرض مميز جدا لكل العملاء الكرام اللي يحبون يشاركونا";
    assertFailsWithRule("ar_gulf", longHeadline, "نص ثانوي", "headline_word_count");
    console.log("  ✅ testArGulfWordCountFail");
}

function testArGulfDialectMarkerFail() {
    assertFailsWithRule(
        "ar_gulf",
        "عايز أعرض لك",
        "كده السعر كويس",
        "dialect_markers",
        "عايز أعرض لك شيء مميز كده",
    );
    console.log("  ✅ testArGulfDialectMarkerFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US4: ar_levantine TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArLevantinePass() {
    assertAllPass(
        "ar_levantine",
        "عرض خاص لكم",
        "تفضل وشوف العروض الحلوة",
    );
    console.log("  ✅ testArLevantinePass");
}

function testArLevantineWordCountFail() {
    const longHeadline = "هاد عرض رهيب كتير بيساعدك تحقق أحلامك كلها بسرعة";
    assertFailsWithRule("ar_levantine", longHeadline, "نص ثانوي", "headline_word_count");
    console.log("  ✅ testArLevantineWordCountFail");
}

function testArLevantineArabicRatioFail() {
    assertFailsWithRule(
        "ar_levantine",
        "Hello World Test Offer",
        "This is mostly English text",
        "arabic_unicode_ratio",
        "Hello World Test Offer This is mostly English text with very little Arabic",
    );
    console.log("  ✅ testArLevantineArabicRatioFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US4: ar_iraqi TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArIraqiPass() {
    assertAllPass(
        "ar_iraqi",
        "عندنا عرض رهيب",
        "شوف العروض المتوفرة اليوم",
    );
    console.log("  ✅ testArIraqiPass");
}

function testArIraqiWordCountFail() {
    const longHeadline = "عندنا عرض رهيب جدا راح يعجبك ويلبي كل احتياجاتك المطلوبة";
    assertFailsWithRule("ar_iraqi", longHeadline, "نص ثانوي", "headline_word_count");
    console.log("  ✅ testArIraqiWordCountFail");
}

function testArIraqiArabicRatioFail() {
    assertFailsWithRule(
        "ar_iraqi",
        "Special Offer Today",
        "Best price guaranteed online",
        "arabic_unicode_ratio",
        "Special Offer Today Best price guaranteed online shop now",
    );
    console.log("  ✅ testArIraqiArabicRatioFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US4: ar_maghreb TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testArMaghrebPass() {
    assertAllPass(
        "ar_maghreb",
        "عرض ممتاز اليوم",
        "شاهد العروض المتاحة الآن",
    );
    console.log("  ✅ testArMaghrebPass");
}

function testArMaghrebWordCountFail() {
    const longHeadline = "عرض ممتاز اليوم عندنا خصم كبير على كل المنتجات المتوفرة";
    assertFailsWithRule("ar_maghreb", longHeadline, "نص ثانوي", "headline_word_count");
    console.log("  ✅ testArMaghrebWordCountFail");
}

function testArMaghrebArabicRatioFail() {
    assertFailsWithRule(
        "ar_maghreb",
        "Great Deal Today",
        "Buy now and save big",
        "arabic_unicode_ratio",
        "Great Deal Today Buy now and save big on all items",
    );
    console.log("  ✅ testArMaghrebArabicRatioFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US5: en TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testEnPass() {
    assertAllPass(
        "en",
        "Transform Your Business",
        "Sign up today and get instant access to everything you need!",
    );
    console.log("  ✅ testEnPass");
}

function testEnWordCountFail() {
    const longHeadline = "This is a really long headline that exceeds the maximum allowed word count for sure";
    assertFailsWithRule("en", longHeadline, "Short subheadline.", "headline_word_count");
    console.log("  ✅ testEnWordCountFail");
}

function testEnMissingCtaFail() {
    assertFailsWithRule(
        "en",
        "Our Product Features",
        "We have many features to offer.",
        "cta_clarity",
    );
    console.log("  ✅ testEnMissingCtaFail");
}

// ═══════════════════════════════════════════════════════════════════════════
// US6: REGRESSION GUARD TESTS
// ═══════════════════════════════════════════════════════════════════════════

function testRegressionArabicRatioRequired() {
    const result = validateLanguageQuality(makeInput(
        "Hello World Test",
        "Short text here",
        "ar_fusha",
        "Hello World Test Short text here no Arabic at all",
    ));
    const ratioCheck = result.checks.find(c => c.rule === "arabic_unicode_ratio");
    assert.ok(ratioCheck, "arabic_unicode_ratio check should exist");
    assert.equal(ratioCheck!.passed, false, "Arabic ratio check should fail for non-Arabic text");
    console.log("  ✅ testRegressionArabicRatioRequired");
}

function testRegressionCtaCheckRequired() {
    const result = validateLanguageQuality(makeInput(
        "Our Amazing Product",
        "We have many features to offer.",
        "en",
    ));
    const ctaCheck = result.checks.find(c => c.rule === "cta_clarity");
    assert.ok(ctaCheck, "cta_clarity check should exist for en locale");
    assert.equal(ctaCheck!.passed, false, "CTA check should fail for passive text");
    console.log("  ✅ testRegressionCtaCheckRequired");
}

function testRegressionUnsupportedLocale() {
    const result = validateLanguageQuality(makeInput(
        "Un texte en français",
        "Sous-titre en français",
        "fr",
    ));
    assert.equal(result.passed, true, "Unsupported locale should pass");
    assert.equal(result.checks.length, 0, "Unsupported locale should have no checks");
    console.log("  ✅ testRegressionUnsupportedLocale");
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

function main() {
    console.log("\n═══ Spec 008 — Language Quality Contract Tests ═══");

    console.log("\n─── US1: ar_fusha ───");
    testArFushaPass();
    testArFushaWordCountFail();
    testArFushaHangingConjunctionFail();

    console.log("\n─── US2: ar_egyptian ───");
    testArEgyptianPass();
    testArEgyptianWordCountFail();
    testArEgyptianDialectMarkerFail();

    console.log("\n─── US3: ar_gulf ───");
    testArGulfPass();
    testArGulfWordCountFail();
    testArGulfDialectMarkerFail();

    console.log("\n─── US4: ar_levantine ───");
    testArLevantinePass();
    testArLevantineWordCountFail();
    testArLevantineArabicRatioFail();

    console.log("\n─── US4: ar_iraqi ───");
    testArIraqiPass();
    testArIraqiWordCountFail();
    testArIraqiArabicRatioFail();

    console.log("\n─── US4: ar_maghreb ───");
    testArMaghrebPass();
    testArMaghrebWordCountFail();
    testArMaghrebArabicRatioFail();

    console.log("\n─── US5: en ───");
    testEnPass();
    testEnWordCountFail();
    testEnMissingCtaFail();

    console.log("\n─── US6: Regression Guards ───");
    testRegressionArabicRatioRequired();
    testRegressionCtaCheckRequired();
    testRegressionUnsupportedLocale();

    console.log("\n═══ Spec 008 — All language quality tests passed ═══\n");
    console.log("languageQuality.test: PASS");
}

main();
