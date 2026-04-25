# Contract: Device Screen Content Ban

**Owner**: prompt-constants module imported by `functions/src/generators.ts` (the `SCREEN_CONTENT_BAN_BLOCK` constant)
**Consumed by**: `functions/src/generators.ts` (every prompt-assembly site that may include a device — `generateBuildPlan()`, `generateFinalAd()`, every carousel slide loop, every batch item loop)

This contract defines the absolute prohibition on rendering text, logos, charts, dashboards, or app UI on any device display in any rendered ad image. It is a prompt-only enforcement (per research D5) — no post-hoc image inspection, no re-render gate.

## The block (verbatim)

The exact string injected into prompts. Stored as an exported constant:

```
═══════════════════════════════════════════════════════════════════
ABSOLUTE RULE — DEVICE SCREEN CONTENT BAN
═══════════════════════════════════════════════════════════════════
NEVER render any of the following on any device display
(laptop screen, desktop monitor, tablet front, phone front,
smartwatch face, or any other device screen visible in the scene):

❌ Text of any kind (UI text, labels, body copy, captions, watermarks)
❌ Logos (brand marks, app icons, software logos, partner logos)
❌ Charts, graphs, dashboards, KPI cards, metric tiles
❌ Application user interfaces (web apps, native apps, OS chrome)
❌ Notification badges, status bars, system text
❌ Code editors, terminal output, slide decks with content

Device screens MUST be one of:
✅ Completely blank dark screen (off-state look)
✅ Abstract gradient (single color or smooth color blend, NO content)
✅ Out-of-focus soft glow (warm or cool, no discernible shapes)
✅ Dimmed unreadable blur (suggests on-state without showing anything readable)

NO EXCEPTIONS. This rule overrides any earlier instruction that
would have placed content on a screen.
═══════════════════════════════════════════════════════════════════
```

## Replacement of the pre-existing line

The pre-existing line at `functions/src/generators.ts:2192`:

```ts
device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.',
```

MUST be rewritten to:

```ts
device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen MUST be blank/abstract per SCREEN_CONTENT_BAN — never any text/logo/chart/UI.',
```

The leftover phrase "Device screen shows content, not blank" is the EXACT root cause of the hallucinated dashboards (per launch matrix line 1363); leaving it in conflict with the new ban is a Principle II silent-drift failure.

## Injection sites

The `SCREEN_CONTENT_BAN_BLOCK` constant MUST be appended to the prompt assembled by EACH of the following call sites:

| Site | Why | Trigger |
|---|---|---|
| `generateBuildPlan()` (the planner LLM call) | Planner must NOT plan a device with screen content. | Always include when `creativeMode` includes `device_mockup` OR the universe is likely to feature a device (corporate, software, education, finance). Conservative: include for ALL prompts — the cost of unnecessary inclusion is one paragraph; the cost of missing inclusion is a fake dashboard. |
| `generateFinalAd()` → `buildFinalImagePrompt()` (the image-model call) | The image model must enforce the ban at render time. | Always — same reasoning. |
| Carousel slide-loop prompt assembly | Each slide is a separate model call; the ban must reach each call. | Per-slide injection (FR-019). |
| Batch variant-loop prompt assembly | Each variant is a separate model call. | Per-variant injection (FR-019). |

Per-iteration re-injection is mandatory — a one-shot global injection at the top of the request payload is INSUFFICIENT because each slide / variant is a separate model call with its own assembled prompt.

## What the ban does NOT cover

- **Physical product packaging text** (e.g. label on a coffee mug, text on a product box) — this is environmental and intended.
- **Signage in the background** (e.g. wall art, store sign, conference logo wall) — environmental and intended; covered by the `environmental` logo placement mode, not the ban.
- **Printed material in the scene** (e.g. open book, magazine, brochure) — physical objects, not device displays. Not covered.
- **Stage screens at events** when explicitly part of an event-style ad — these are scene elements, not device displays. Not covered. (Edge case: if the planner chooses an `event` universe with a stage screen, the screen is a scene element and the ban does not apply. The planner is trusted on this distinction; if false-positives accumulate post-launch, expand the ban prose.)

## Failure mode

The ban is enforced via prompt instruction. If the model violates the ban anyway (rare but possible), the resulting ad delivers as-is — no post-hoc detection, no re-render. Per spec § Out of Scope and per research D5. SC-003 sets a 0/20 review-sample target as the post-deploy verification.

## Test fixtures (HFE.8)

| # | Scenario | Assertion |
|---|---|---|
| Ban-1 | Generate any ad — assemble the planner prompt | The assembled prompt string contains `SCREEN_CONTENT_BAN_BLOCK` verbatim. |
| Ban-2 | Generate any ad — assemble the image-model prompt | The assembled prompt string contains `SCREEN_CONTENT_BAN_BLOCK` verbatim. |
| Ban-3 | Carousel of 5 slides — assemble each slide's image-model prompt | Each of the 5 assembled prompt strings contains `SCREEN_CONTENT_BAN_BLOCK`. |
| Ban-4 | Batch of 4 variants — assemble each variant's image-model prompt | Each of the 4 assembled prompt strings contains `SCREEN_CONTENT_BAN_BLOCK`. |
| Ban-5 | Generate any ad after the line-2192 rewrite | The assembled prompt string for `device_mockup` mode does NOT contain the substring "Device screen shows content, not blank". |

## Out of scope

- Post-hoc vision inspection of the rendered image to verify screen-content compliance — explicitly out of scope (research D5, spec § Out of Scope).
- Generative inpaint over violating screen regions — out of scope.
- A separate "screens may show our app" allow-list for SaaS-product ads — out of scope; if a future product-screen-required mode is added, it joins as a new creative mode, not as an exception to this ban.
