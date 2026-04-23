# Feature Specification: Cultural Compliance Hotfix (Arabic Market Guardrails)

**Feature Branch**: `0951-hotfix-cultural-compliance`
**Created**: 2026-04-22
**Status**: Draft
**Input**: User description: "HOTFIX-C — Cultural Compliance (Arabic Market Guardrails) from docs/LAUNCH_MATRIX.md"

## Clarifications

### Session 2026-04-22

- Q: When an Arabic user loads a pre-hotfix saved project whose environment is now blocked, what should happen? → A: Load fully editable; block only the Generate action with an inline "Pick an Arabic-safe environment" prompt. All prior work (hook, concept, copy, build-plan history) is preserved. This mirrors the plan-alignment hotfix "soft grandfather" pattern — keep data, block the risky action.
- Q: When the user flips the ad language from English → Arabic mid-session while a haram environment is already selected, what happens? → A: Allow the language switch to take effect immediately; auto-clear only the environment field; show an inline prompt at the environment picker to re-select. All other fields (hook text, concept text, copy, reference uploads) are preserved. The Generate action remains blocked until a new Arabic-safe environment is chosen.
- Q: Which locales count as "Arabic" for triggering the guardrails? → A: Any locale whose code begins with `ar` (e.g., `ar`, `ar-SA`, `ar-EG`, `ar-MA`). All Arabic dialects get the identical guardrail set. Dialect-specific strictness tiers are explicitly out of scope for this hotfix.
- Q: How should the `culturalViolation` signal be exposed when a post-validation replacement fires? → A: Silent to the end user; logged only to the internal resolution trace for ops/product review. No toast, no banner, no user-facing detail panel. Surfacing the replacement risks reading as "we censored you" to a customer who did nothing wrong, when in practice the replacement is almost always cleaning up a model-side leak. If leakage rates ever warrant a customer-facing disclosure, it can be added as a later enhancement.
- Q: Does the post-generation trigger-word scan apply to ad copy (hook text, subhead, caption) too, or only to the image-pipeline prompt? → A: Scan both. The image-pipeline prompt (technical-prompt text) AND the user-facing ad copy (hook text, subhead, caption) are both scanned against the same trigger-word list, replaced with the same culturally neutral substitutions, and logged with the same `culturalViolation` flag on the resolution trace. A haram word in the caption is as commercially unusable for the Arabic audience as a wine glass in the image.

## Context

Pro Ads AI is an Arabic-first product aimed at coaches and consultants in the GCC/Gulf market. The ad-generation pipeline currently has no cultural guardrails: the environment library ("universes") contains haram settings such as wine cellars, rooftop bars, cigar lounges, vineyards, and wine-tasting rooms; the visual-motif data that feeds every image prompt includes strings like "cocktails", "champagne", "whiskey", and "private bar"; there are no modesty rules in the wardrobe guidance; and there is no post-generation safety net to catch haram terms that leak through. As a result, Arabic ads are being rendered with wine glasses, champagne flutes, bar scenes, and revealing clothing — all of which are commercially unusable for the target audience and violate the product's launch promise.

This hotfix retrofits the pipeline with cultural guardrails that apply **only when the ad is being generated in Arabic**. English-language ads are explicitly unaffected: no universes are hidden, no motif rewrites occur, and no compliance block is injected. The hotfix blocks no new feature work other than requiring Phase 5 (the render/prompt pipeline) to already exist. It must ship before any Phase 10+ user-facing feature because every downstream feature inherits these prompts.

The hotfix operates at four layers of the pipeline simultaneously, because a single-layer fix is not safe: (1) the **data layer** is sanitized so every downstream consumer gets clean motifs and a flag per environment, (2) the **UI layer** hides haram environments from Arabic users, (3) the **prompt layer** injects an explicit cultural-compliance block and modesty rules into every build plan and every final image prompt (including per slide and per batch item), and (4) a **post-generation validation layer** scans the resolved prompt for leaked trigger words and rewrites them as a safety net.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Arabic user never sees haram environments in the universe picker (Priority: P1)

An Arabic customer opens Step 1 and browses the environment ("universe") library. The dropdown is filtered so that haram settings — wine cellar, wine tasting room, rooftop bar, cigar lounge, vineyard, dance studio, and the sushi-bar entry (renamed to remove the "bar" wording) — are not present. They are hidden entirely, not greyed-out or marked as locked, because the business does not want to advertise the existence of these options to this audience. Every other environment remains available.

**Why this priority**: This is the first and most visible guardrail. If the picker shows a "Wine Cellar" card to an Arabic-speaking user, trust is lost before a single ad is generated. Hiding haram environments at the UI is the cheapest and most obvious signal that the product understands the audience.

**Independent Test**: Switch the ad language to Arabic in Step 1 and scroll through every environment category. Confirm wine cellar, wine tasting, rooftop bar, cigar lounge, vineyard, dance studio, and `r_sushi_counter` are all **absent** from the picker (per FR-007 these entries are hidden entirely, not re-labelled or locked). Switch to English and confirm all of them — including `r_sushi_counter` under its renamed "Premium Sushi Counter" label — reappear.

**Acceptance Scenarios**:

1. **Given** an Arabic ad configuration, **When** the user opens the universe picker, **Then** the wine cellar, wine tasting, rooftop bar, cigar lounge, vineyard, and dance studio environments are not visible.
2. **Given** an Arabic ad configuration, **When** the user opens the universe picker, **Then** `r_sushi_counter` (marked `arabicSafe: false` per FR-002, filtered per FR-007) is hidden entirely from the universe picker — not shown under any label.
3. **Given** an English ad configuration, **When** the user opens the universe picker, **Then** every environment — including the six haram-flagged universes and `r_sushi_counter` — is visible and selectable; `r_sushi_counter` appears under its renamed English label ("Premium Sushi Counter") which no longer contains the word "bar", and this renamed entry is also what the loader resolves to when a legacy saved project references the former `r_sushi_bar` identifier.
4. **Given** the user switches the language mid-session from English to Arabic after selecting a haram environment, **When** the language change takes effect, **Then** the user is prompted to pick an Arabic-safe environment before continuing to the next step.

---

### User Story 2 — Arabic ads never render alcohol, bars, or haram elements (Priority: P1)

An Arabic customer generates an ad in any environment (even one that is nominally allowed, such as a private jet or a networking event). The rendered image contains no alcohol in any form: no wine glasses, beer bottles, champagne flutes, cocktails, whiskey tumblers, spirits bottles, or any drinking vessel that implies alcohol. It contains no nightclub / bar / pub interior, no gambling surfaces (cards, chips, roulette, slot machines), no pork products, no dogs as pets, and no non-Islamic religious symbols unless they are contextually required by the product. Luxury and aspirational signalling is preserved through premium tea and coffee, luxury watches, fine halal dining, architecture, cars, travel, and nature — not through alcohol or nightlife.

**Why this priority**: This is the core purpose of the hotfix. An ad containing a wine glass or a cocktail is commercially unusable for the Arabic target audience and reputationally damaging for the business. Every Arabic render must pass this bar, regardless of which environment the user picked or which creative mode is active.

**Independent Test**: As an Arabic user, generate a single ad, a batch of ads, and a carousel in three different environments that are Arabic-safe but historically produced haram motifs (private jet, networking event, harbour yacht club). Visually inspect every rendered image and confirm none contain any alcohol, drinking vessels, bar counters, gambling, or other haram elements. Inspect the generated prompt text and confirm the cultural-compliance instructions are present.

**Acceptance Scenarios**:

1. **Given** an Arabic ad using the private jet environment, **When** the image renders, **Then** the scene contains no champagne and no alcoholic beverages.
2. **Given** an Arabic ad using the networking event environment, **When** the image renders, **Then** the scene contains no cocktails and no bar counter.
3. **Given** an Arabic ad, **When** the prompt is built for the image model, **Then** the prompt contains the cultural-compliance block listing prohibited elements and approved luxury substitutions.
4. **Given** an Arabic carousel, **When** each slide is rendered, **Then** the cultural-compliance block is present in every slide's prompt, not only the first.
5. **Given** an Arabic batch, **When** each batch item is rendered, **Then** the cultural-compliance block is present in every item's prompt.

---

### User Story 3 — Arabic ads depict people in modest dress (Priority: P1)

An Arabic customer generates an ad that includes human figures. All figures — male and female — are rendered in conservative, modest clothing: shoulders covered, no deep necklines, no short skirts or shorts, no swimwear, no gym wear exposing skin, no lingerie or underwear visible. Female figures wear hijab only if a hijab is already present in the user's uploaded reference — the system never adds or removes hijab on its own. Luxury fashion is still encouraged, expressed through covered luxury: tailored suits, abayas, elegant modest dresses, thobes. Mixed-gender physical contact beyond a handshake is not rendered.

**Why this priority**: Apparel is the second most common violation after alcohol. A modestly composed scene that still renders a woman with bare shoulders or a short skirt fails the same cultural bar as a champagne glass would. Wardrobe rules must be enforced at the prompt layer before every Arabic render.

**Independent Test**: As an Arabic user, generate a coach-portrait ad, a testimonial ad with a female figure, and a speaker-card ad with a male figure. Visually confirm every rendered figure is dressed according to the modesty rules. Upload a reference photo with hijab and confirm the hijab is preserved; upload a reference without hijab and confirm the system does not add one.

**Acceptance Scenarios**:

1. **Given** an Arabic ad with a female figure, **When** the image renders, **Then** shoulders are covered, necklines are not deep, and the lower body is covered to below the knee or by trousers.
2. **Given** an Arabic ad with a male figure, **When** the image renders, **Then** the figure is at minimum in business-casual attire, with no tank tops and no shorts above the knee.
3. **Given** an Arabic ad in which the user's reference image includes a hijab, **When** the image renders, **Then** the hijab is preserved.
4. **Given** an Arabic ad in which the user's reference image does not include a hijab, **When** the image renders, **Then** the system does not add a hijab to the figure.
5. **Given** an Arabic ad, **When** the prompt is built, **Then** the wardrobe section of the prompt contains the modesty rules.

---

### User Story 4 — Post-generation validation catches and repairs any leaked haram terms in both image prompts and ad copy (Priority: P1)

Even after all data sanitization and prompt-injection layers are in place, language-model outputs (the build plan text, and the user-facing ad copy — hook, subhead, caption) can still contain leaked trigger words (e.g., "wine", "cocktail", "champagne", "bar counter", "nightclub", "casino", "gambling", "bikini", "swimsuit", "lingerie", "revealing", "cleavage", "short skirt", "tank top", "strapless"). For Arabic ads, the system scans BOTH the image-pipeline prompt AND the user-facing ad copy for the same trigger-word list, replaces each match with a culturally neutral substitute before the prompt is sent to the image model or the copy is returned to the user, and records the violation on the generation's resolution trace — annotated by source layer (image prompt vs ad copy) — so that ops and product can monitor leakage rates per layer over time.

**Why this priority**: This is the safety net. Without it, a single prompt-layer miss results in a haram render or a haram caption that reaches the user. A haram word in the caption is as commercially unusable for the Arabic audience as a wine glass in the image, so the safety net must cover both. Replacement plus logging is a belt-and-braces guarantee that even a partially-broken upper layer cannot produce non-compliant content.

**Independent Test**: Force two generations. In the first, stub the build-plan text so the technical-prompt contains a trigger word; confirm the resolved image prompt no longer contains it and the trace records a cultural violation on the image-prompt layer. In the second, stub the hook or caption text so the user-facing copy contains a trigger word; confirm the returned copy no longer contains it, the substitution matches the shared table (e.g., "wine" → "premium tea"), and the trace records a cultural violation on the ad-copy layer.

**Acceptance Scenarios**:

1. **Given** an Arabic build plan whose technical-prompt text contains "cocktail", **When** post-generation validation runs, **Then** "cocktail" is replaced with a culturally neutral substitute in the prompt sent to the image model.
2. **Given** an Arabic build plan whose technical-prompt text contains "wine", **When** validation runs, **Then** the replacement substitutes a non-alcoholic premium beverage (e.g., premium tea).
3. **Given** an Arabic ad whose generated hook text contains "champagne", **When** validation runs, **Then** "champagne" is replaced with the same culturally neutral substitute used for the image-prompt layer before the hook is returned to the user or persisted.
4. **Given** an Arabic ad whose generated caption contains "cocktail", **When** validation runs, **Then** the caption returned to the user no longer contains "cocktail" and the substitution matches the shared trigger-substitution table.
5. **Given** any Arabic generation in which a trigger word was replaced on either layer, **When** the generation completes, **Then** the resolution trace records a `culturalViolation` flag, the list of matched words, and the source layer (image prompt vs ad copy).
6. **Given** an English build plan or English caption containing the word "wine", **When** validation runs, **Then** no replacement occurs on either layer and no cultural-violation flag is recorded.

---

### User Story 5 — English ads are unaffected (Priority: P1)

An English-language customer continues to get the full, unfiltered product. Every environment — including wine cellar, rooftop bar, cigar lounge, vineyard, and dance studio — is visible and selectable. The cultural-compliance block is not injected into the build plan. The Arabic wardrobe modesty rules are not added to the prompt. Post-generation haram-term replacement does not run. English ads render with whatever creative freedom the model and the user's inputs allow.

**Why this priority**: The guardrails are an Arabic-market requirement, not a global content policy. Applying them to English ads would needlessly restrict a legitimate use case and damage creative quality for a customer segment that has no cultural-compliance need. The language gate must be precise on both sides.

**Independent Test**: As an English user, generate a single ad in the wine cellar environment and a carousel in the rooftop bar environment. Confirm both renders complete without any cultural-compliance block, without wardrobe modesty rules, and without any post-generation term replacement. Inspect both prompts and confirm they are identical in structure to the pre-hotfix English prompts.

**Acceptance Scenarios**:

1. **Given** an English ad configuration, **When** the universe picker opens, **Then** the wine cellar, wine tasting, rooftop bar, cigar lounge, vineyard, and dance studio environments are all visible.
2. **Given** an English ad, **When** the build plan is generated, **Then** the prompt does not contain the cultural-compliance block.
3. **Given** an English ad with human figures, **When** the build plan is generated, **Then** the prompt does not contain the Arabic wardrobe modesty rules.
4. **Given** an English build plan whose technical-prompt text contains the word "wine", **When** validation runs, **Then** the word is preserved and no violation flag is recorded.

---

### Edge Cases

- A user starts an ad in English, selects the wine cellar environment, and switches the language to Arabic before generating. The language switch takes effect immediately, the environment selection is auto-cleared (all other fields preserved), and an inline prompt at the environment picker asks the user to pick an Arabic-safe environment before the Generate action becomes enabled.
- A user loads a saved project that was created before the hotfix and references one of the now-blocked environments in Arabic. The project loads fully editable so prior work is not lost; an inline prompt at the environment picker requires the user to pick an Arabic-safe environment before the Generate action becomes enabled.
- A user loads a saved project that references the former "sushi bar" identifier. The system must resolve the identifier to its renamed equivalent rather than failing with an unknown-universe error.
- An Arabic user uses a creative mode (testimonial, speaker card, before/after) that includes human figures in poses where the model sometimes defaults to revealing dress. The modesty rules and the post-validation layer must both still apply.
- An Arabic user uploads a reference photo that shows a cocktail in the user's hand. **Best-effort guidance only — deferred:** this edge case relies on pre-upload image analysis of reference photos, which is out of scope for the hotfix (no image-scan hook exists today; see `generators.ts::generateFinalAd` and the post-parse text-only scan in `generators.ts::generateBuildPlan` that covers hook/subhead/caption/tech-prompt but NOT reference-image pixels). The `CULTURAL_COMPLIANCE_BLOCK` already instructs the model to "omit or replace alcohol elements" in renderings, which covers most cases, but there is no guarantee the model obeys it when a reference photo strongly anchors the scene. Reference-photo pre-upload image-analysis sanitization is tracked as a follow-up; until then, users who upload haram reference photos may see leaked elements in the final render and should replace the reference.
- The model produces a build plan in which a haram term is embedded inside a compound word or an unusual phrase (e.g., "barstool", "wine-dark"). The trigger-word matcher must either handle these cases or clearly limit its scope so downstream human review knows where coverage stops.
- A carousel or batch generation has a partial failure halfway through rendering. Every successfully rendered item must still have passed through the cultural-compliance layers; the retry of the failed items must not skip the guardrails.

## Requirements *(mandatory)*

### Functional Requirements

**Data layer — environment library**

- **FR-001**: The system MUST mark each environment in the library with an Arabic-safety flag indicating whether it is allowed to appear for Arabic ad configurations. An ad configuration is considered Arabic if and only if its ad-language code begins with `ar` (e.g., `ar`, `ar-SA`, `ar-EG`, `ar-MA`); all Arabic locales resolve to the identical guardrail set for this hotfix.
- **FR-002**: The system MUST mark the following environments as not Arabic-safe: wine cellar, wine tasting room, rooftop bar, cigar lounge, vineyard, dance studio, and the former "sushi bar" entry.
- **FR-003**: The system MUST rename the former "sushi bar" environment to remove the word "bar" from its identifier and its user-visible label, so that the word "bar" is not surfaced even in its Arabic-safe sibling.
- **FR-004**: The system MUST sanitize the visual-motif data attached to every environment so that no motif contains any of the following haram terms: cocktails, champagne, whiskey, wine, beer, spirits, cocktail reception, private bar, premium bar, bottles, barrels. **Scope (FR-004 clarification):** sanitization applies retroactively to every existing `visualMotifs` entry in `src/universeDatabase.ts` AND prospectively to any new/updated environment definition. The implementation form is a hybrid — source literals MAY stay un-edited for diff-readability, BUT the exported array (the value every downstream consumer imports) MUST be the sanitized version. A deploy-time assertion SHOULD verify that no string in `HARAM_MOTIFS` appears in any exported entry's `visualMotifs`. No background Firestore migration is required; sanitization lives entirely at the data-module layer.
- **FR-005**: When sanitizing motifs, the system MUST replace each haram term with a culturally neutral alternative that preserves the luxury/aspirational intent of the original motif (e.g., "cocktails" → "premium beverages", "champagne" → "sparkling drinks", "cocktail reception" → "elegant reception", "private bar" → "private lounge area").
- **FR-006**: Motif sanitization (FR-004) MUST be applied at the data layer so every downstream consumer — build plan, image prompt, per-slide prompt, per-batch-item prompt — receives already-clean motifs. Acceptance criteria: a single fixture assertion iterating the exported `UNIVERSES` array and confirming zero occurrences of any `HARAM_MOTIFS` string in any `visualMotifs` entry; this assertion ALSO serves as the retroactive-sanitization proof required by FR-004.

**UI layer — configuration filtering**

- **FR-007**: When the ad language is set to Arabic, the system MUST hide from every environment picker any environment whose Arabic-safety flag is not true. Hidden environments MUST be absent from the UI, not greyed-out or marked as locked.
- **FR-008**: When the ad language is set to English, the system MUST show every environment in the picker regardless of Arabic-safety flag.
- **FR-009**: When the user switches an in-progress ad configuration from English to Arabic after having selected an environment that is not Arabic-safe, the system MUST (a) allow the language switch to take effect immediately, (b) auto-clear only the environment-selection field, (c) preserve all other fields (hook text, concept text, copy, reference uploads, build-plan history), (d) display an inline prompt at the environment picker asking the user to pick an Arabic-safe environment, and (e) keep the Generate action blocked until a new Arabic-safe environment is chosen.
- **FR-010**: When a saved project that references a now-blocked environment is re-opened under an Arabic configuration, the system MUST load the project fully readable/editable (preserving hook, concept, copy, build-plan history, and mockup history), display an inline "Pick an Arabic-safe environment" prompt at the environment picker, and block the Generate action until the user selects an Arabic-safe environment. The project MUST NOT be force-migrated to a new environment automatically, and MUST NOT be blocked from loading or from editing non-environment fields.
- **FR-011**: When a saved project references the former "sushi bar" identifier, the system MUST resolve it to the renamed identifier without user intervention and without failing.

**Prompt layer — cultural-compliance block**

- **FR-012**: When the ad language is Arabic, the system MUST inject a cultural-compliance block into the build-plan prompt before the technical section. The block MUST explicitly prohibit alcohol in any form (wine glasses, beer bottles, champagne, cocktails, whiskey, spirits, and any drinking vessel implying alcohol), nightclub/bar/pub interiors, gambling elements (cards, chips, roulette, slot machines), pork products, dogs as pets, and non-Islamic religious symbols except where the product being advertised requires them.
- **FR-013**: The cultural-compliance block MUST provide the model with an approved luxury-signalling palette (premium tea and coffee, luxury watches, fine halal dining, architecture, cars, travel, nature) so that luxury intent is preserved, not stripped.
- **FR-014**: The cultural-compliance block MUST instruct the model that when the chosen environment implies a bar/lounge/club setting, any alcohol element must be replaced with a premium non-alcoholic beverage such as Arabic coffee, tea, juice, or water.
- **FR-015**: When the ad language is English, the system MUST NOT inject the cultural-compliance block into the build-plan prompt.
- **FR-016**: When the ad language is Arabic, the system MUST also inject the cultural-compliance block into the final image prompt — the last prompt the image model sees — as a reinforcement layer.
- **FR-017**: For Arabic carousels, the cultural-compliance block MUST appear in every slide's prompt, not only the first.
- **FR-018**: For Arabic batch generations, the cultural-compliance block MUST appear in every batch item's prompt.

**Prompt layer — wardrobe modesty**

- **FR-019**: When the ad language is Arabic, the system MUST add a modesty-rules section to the wardrobe guidance in the prompt. Rules MUST cover: (a) all figures dressed conservatively, (b) female figures with shoulders covered, no cleavage, and lower body covered to below the knee or by trousers, (c) male figures at minimum in business-casual attire with no tank tops and no shorts above the knee, (d) no swimwear, gym wear exposing skin, lingerie, or visible underwear, (e) luxury fashion encouraged, expressed as covered luxury (suits, abayas, elegant modest dresses, thobes).
- **FR-020**: The hijab rule MUST be: if a hijab is already present in the user's uploaded reference, preserve it; otherwise, do not add or remove a hijab.
- **FR-021**: When the ad language is English, the system MUST NOT inject the Arabic wardrobe modesty rules.

**Validation layer — post-generation safety net**

- **FR-022**: For Arabic ads, after text-producing pipeline stages complete, the system MUST scan BOTH (a) the image-pipeline prompt (the technical-prompt text sent to the image model) AND (b) the user-facing ad copy (hook text, subhead text, caption text) for a defined list of trigger words including at minimum: wine, whiskey, cocktail, champagne, beer, vodka, rum, gin, tequila, bourbon, alcohol, bar counter, nightclub, pub, casino, gambling, bikini, swimsuit, lingerie, revealing, cleavage, short skirt, tank top, crop top, tube top, halter, backless, strapless, brothel. The same trigger list applies to both the image prompt and the ad copy. **Scope note:** FR-022 trigger-word matching is applied as whole words and short whitespace-separated phrases only; embedded or compound occurrences (e.g., "barstool", "wine-dark", hyphenated variants) are explicitly out of scope for this hotfix and are deferred to a future pass informed by observed false-negatives in the resolution-trace leakage logs.
- **FR-023**: When the scan finds any trigger word in the image-pipeline prompt, the system MUST replace it with a culturally neutral substitute before the prompt is sent to the image model. When the scan finds any trigger word in the ad copy (hook, subhead, or caption), the system MUST replace it with the same culturally neutral substitute before the copy is returned to the user or persisted on the generation record. Example substitutions: "wine" → "premium tea", "cocktail" → "artisan coffee", "champagne" → "sparkling water", "bar counter" → "service counter", "nightclub" → "premium lounge". The substitution table MUST be identical for the image-prompt scan and the ad-copy scan.
- **FR-024**: When the scan finds any trigger word — in either the image-pipeline prompt OR the ad copy — the system MUST record on the generation's resolution trace a `culturalViolation` flag and the list of matched words, annotated with the source layer (image prompt vs ad copy) so that product and ops can monitor leakage rates per layer over time. This signal MUST remain internal — it MUST NOT be surfaced to the end user via toast, banner, or any other customer-facing UI element. Customer-facing visibility of replacements is explicitly out of scope for this hotfix.
- **FR-025**: When the ad language is English, the system MUST NOT run the post-generation trigger-word scan on either the image-pipeline prompt or the ad copy. English ad copy containing the word "wine" or any other trigger word MUST be preserved verbatim.

### Key Entities *(data involved)*

- **Environment (universe) entry**: An item in the pre-defined environment library the user picks in Step 1. Attributes relevant to this hotfix: the Arabic-safety flag, the list of visual motifs, and the user-visible label. An entry is either renderable for Arabic ads or hidden from them.
- **Ad configuration**: The user's in-flight choices for a single generation. Attributes relevant here: ad language code (an Arabic locale like `ar`, `ar-SA`, `ar-EG` triggers the Arabic guardrail set; any non-Arabic locale — including every English variant — triggers no guardrails), chosen environment, chosen creative mode. The ad language code drives every guardrail toggle, and all `ar*` locales resolve to the same rule set for this hotfix.
- **Build plan**: The internal prompt artifact that the system produces before the image model is invoked. It contains a technical-prompt section and a wardrobe section. The cultural-compliance block and the modesty rules are inserted into this artifact for Arabic ads.
- **Resolution trace**: The per-generation diagnostic record that captures which guardrails fired, which replacements were made, which trigger words (if any) were caught by the validation layer, and on which source layer each was caught (image-pipeline prompt vs user-facing ad copy). Used by product and ops to monitor compliance and per-layer leakage rates over time. Strictly internal — never surfaced to the end user.
- **Ad copy**: The user-facing text generated alongside the image — at minimum the hook text, subhead text, and caption text. For Arabic ads, the post-validation trigger-word scan is applied to these text fields using the same trigger list and the same substitution table as the image-pipeline prompt.
- **Saved project**: A previously saved ad configuration that may reference an environment identifier that has since been blocked or renamed. Relevant attributes: the stored environment identifier, the stored ad language.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of Arabic ad renders across single, batch, and carousel flows contain no alcohol, no drinking vessels implying alcohol, no bar/nightclub/pub interiors, no gambling surfaces, no pork, no dogs-as-pets, and no non-Islamic religious symbols beyond those required by the product — verified across a sample set of at least 30 renders covering every supported creative mode.
- **SC-002**: 0% of Arabic ad configurations show a blocked environment (wine cellar, wine tasting, rooftop bar, cigar lounge, vineyard, dance studio, r_sushi_counter) in the environment picker, verified by opening the picker in Arabic and confirming the absence of every blocked entry — including r_sushi_counter, which is also `arabicSafe: false` despite its Arabic-audience-neutral rename.
- **SC-003**: 100% of Arabic ad renders depicting human figures show modest dress as defined in FR-019 — verified across a sample set of at least 20 renders drawn from modes that include human figures.
- **SC-004**: 0% of English ad renders are affected by Arabic guardrails: no environments hidden, no compliance block injected, no wardrobe modesty rules injected, no post-generation term replacement triggered — verified across a control set of at least 10 English renders.
- **SC-005**: 100% of Arabic build plans contain the cultural-compliance block in the technical-prompt section, the final image prompt, every carousel slide's prompt, and every batch item's prompt — verified by inspecting the prompt artifacts of a sample set.
- **SC-006**: 100% of known haram trigger words, when artificially injected into an Arabic build plan OR into generated Arabic ad copy (hook, subhead, or caption), are detected on the correct layer, replaced in the outgoing text using the shared substitution table, and logged with a `culturalViolation` flag plus source-layer annotation on the resolution trace — verified by the cultural-compliance fixture set, which MUST include at least one image-prompt-layer case AND at least one ad-copy-layer case AND at least one carousel case (per FR-017 — proving the scan fires on a non-first slide across a multi-prompt carousel operation) AND at least one batch case (per FR-018 — proving the scan fires on a non-first item across a multi-prompt batch operation). Each of the four cases MUST produce a distinct `culturalViolation` trace entry with the correct `sourceLayer` annotation.
- **SC-007**: 0% of loaded saved projects that reference the former "sushi bar" identifier fail with an unknown-universe error; all resolve silently to the renamed identifier.
- **SC-008**: Cultural guardrail coverage (data flag, UI filter, prompt block, validation) reaches production in a single deploy window, so that no intermediate state ships in which one layer is live but another is not.

## Assumptions

- Phase 5 (render/prompt pipeline) is complete and the prompt-generation artifacts exist at the points where the cultural-compliance block needs to be injected. This hotfix retrofits those artifacts; it does not redesign the pipeline.
- The existing ad-language signal is reliable: a configuration with an Arabic-language setting is always intended for the Arabic market, and the same is true of English. No cross-wired configurations are in scope.
- Luxury and aspirational intent is a retained product goal for Arabic ads. Guardrails must substitute, not strip — replacing alcohol with premium non-alcoholic equivalents rather than deleting luxury references altogether.
- The list of haram trigger words in FR-022 is initial and will expand over time as leakage patterns are observed in the resolution trace. The hotfix ships with the baseline list; extension is a follow-up.
- Trigger-word matching is applied to whole words and short phrases as captured in the trigger list. Embedded or compound cases (e.g., "barstool", "wine-dark") are out of scope for this hotfix and are deferred to a future pass informed by observed false negatives.
- Mixed-language or non-Arabic / non-English configurations are out of scope. The hotfix covers only the Arabic-vs-English split; any locale whose code begins with `ar` is treated as Arabic and receives the identical guardrail set, and every non-`ar` locale receives no guardrails. Dialect-specific strictness tiers (e.g., different rules for Gulf vs Maghreb Arabic) are explicitly out of scope for this hotfix and may be introduced later if engagement data justifies it.
- Re-rendering of older generations produced before the hotfix is out of scope. The hotfix applies to new generations and to regenerations made from saved projects going forward.
- The renaming of the "sushi bar" identifier is paired with a backwards-compatible read-side migration so that existing saved projects referencing the old identifier continue to load without user-facing error.
