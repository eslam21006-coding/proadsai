// functions/src/__tests__/savedProjects.projectStatus.test.ts — parity tests for deriveStatus

import assert from "node:assert/strict";
import { deriveStatus } from "../savedProjects/projectStatus.js";
import {
  legacyProjectNoStatusNoRender,
  singleFormatRenderedNoMeta,
  carouselRenderedNoMeta,
  batchRenderedNoMeta,
  formatSwitchedSingleToCarousel,
  publishedThenMetaRemoved,
  publishedWithMeta,
  draftWithInputsOnly,
  draftNullInputs,
} from "./__fixtures__/savedProjects.fixtures.js";

function run() {
  console.log("phase13 ▸ projectStatus tests");

  // ─── Legacy project with no status → draft ───
  {
    const result = deriveStatus(undefined, legacyProjectNoStatusNoRender);
    assert.equal(result, "draft", "legacy → draft");
  }

  // ─── Single render (no meta) → rendered ───
  {
    const result = deriveStatus(undefined, singleFormatRenderedNoMeta);
    assert.equal(result, "rendered", "single render → rendered");
  }

  // ─── Carousel render (no meta) → rendered ───
  {
    const result = deriveStatus(undefined, carouselRenderedNoMeta);
    assert.equal(result, "rendered", "carousel render → rendered");
  }

  // ─── Batch render (no meta) → rendered ───
  {
    const result = deriveStatus(undefined, batchRenderedNoMeta);
    assert.equal(result, "rendered", "batch render → rendered");
  }

  // ─── Format-switched: carousel wins over mockupHistory ───
  {
    const result = deriveStatus(undefined, formatSwitchedSingleToCarousel);
    assert.equal(result, "rendered", "format-switched → rendered");
  }

  // ─── Meta ad present → published ───
  {
    const result = deriveStatus(undefined, publishedWithMeta);
    assert.equal(result, "published", "metaAdId → published");
  }

  // ─── Published latch: published + meta removed → published ───
  {
    const result = deriveStatus("published", publishedThenMetaRemoved);
    assert.equal(result, "published", "published latch holds");
  }

  // ─── Draft inputs only → draft ───
  {
    const result = deriveStatus(undefined, draftWithInputsOnly);
    assert.equal(result, "draft", "inputs only → draft");
  }

  // ─── Null inputs → draft ───
  {
    const result = deriveStatus(undefined, draftNullInputs);
    assert.equal(result, "draft", "null inputs → draft");
  }

  // ─── Rendered cannot demote to draft ───
  {
    const result = deriveStatus("rendered", legacyProjectNoStatusNoRender);
    assert.equal(result, "rendered", "rendered latch holds over draft data");
  }

  // ─── Published cannot demote to rendered ───
  {
    const result = deriveStatus("published", singleFormatRenderedNoMeta);
    assert.equal(result, "published", "published latch holds over rendered data");
  }

  // ─── Draft upgrades to rendered ───
  {
    const result = deriveStatus("draft", singleFormatRenderedNoMeta);
    assert.equal(result, "rendered", "draft → rendered upgrade");
  }

  // ─── Draft upgrades to published ───
  {
    const result = deriveStatus("draft", publishedWithMeta);
    assert.equal(result, "published", "draft → published upgrade");
  }

  // ─── Rendered upgrades to published ───
  {
    const result = deriveStatus("rendered", publishedWithMeta);
    assert.equal(result, "published", "rendered → published upgrade");
  }

  console.log("✅ phase13 ▸ projectStatus — all 14 tests passed");
}

run();
