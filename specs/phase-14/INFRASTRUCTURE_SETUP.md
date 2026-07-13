# Phase 14 — Cloud Infrastructure Setup Commands

This file documents the **manual / one-time cloud infrastructure provisioning**
required by Phase 14. These commands MUST be run by a maintainer with GCP
project-level access before Phase 14 production deployment. They cannot be run
from a code-only environment.

> **Status:** T001 + T002 are environment-external. The code in
> `functions/src/tokenCrypto.ts`, `functions/src/metaSync/worker.ts`, etc.
> references the resources created here by **resource-id strings only** — no
> code change is required once these are provisioned.

---

## T001 — Cloud KMS Key Ring + Key (Meta-Token Envelope Encryption)

**Why**: The long-lived Meta user token is stored KMS-envelope-encrypted in
Firestore (`users/{uid}/workspaces/{workspaceId}/private/metaConnection`). The
envelope encryption key lives in Cloud KMS.

**Region**: `europe-west1` (matches Cloud Functions region)

```powershell
# 1. Create the key ring (one-time)
gcloud kms keyrings create proads-meta-tokens `
    --location=europe-west1 `
    --project=proadsai-saas

# 2. Create the CryptoKey (one-time; key rotation handled via KMS UI)
gcloud kms keys create meta-token-envelope `
    --location=europe-west1 `
    --keyring=proads-meta-tokens `
    --purpose=encryption `
    --protection-level=software `
    --project=proadsai-saas

# 3. Grant the Cloud Functions service account encrypt/decrypt permission
#    (replace <CF-SA> with the project's default compute SA, typically
#     "firebase-adminsdk-…@proadsai-saas.iam.gserviceaccount.com" or the
#     App Engine default service account).
gcloud kms keys add-iam-policy-binding meta-token-envelope `
    --location=europe-west1 `
    --keyring=proads-meta-tokens `
    --member="serviceAccount:<CF-SA>" `
    --role=roles/cloudkms.cryptoKeyEncrypterDecrypter `
    --project=proadsai-saas
```

**Resource ID to record** for `tokenCrypto.ts`:

```
projects/proadsai-saas/locations/europe-west1/keyRings/proads-meta-tokens/cryptoKeys/meta-token-envelope
```

---

## T002 — Cloud Tasks Queue (`metaSyncAccountWorker`)

**Why**: The 3am daily sync fans out into N tasks (one per connected Meta
account). Cloud Tasks gives us per-task retries, exponential backoff, and a
concurrency cap declaratively.

```powershell
# 1. Create the Firebase Functions v2 task queue (one-time)
#    Note: this requires `firebase-tools` and admin SDK on the project.
firebase functions:queues:create metaSyncQueue `
    --location=europe-west1 `
    --max-concurrent-dispatches=5 `
    --max-attempts=3 `
    --project=proadsai-saas

# (Alternative via gcloud if `firebase functions:queues:create` is unavailable:)
# NOTE: gcloud's --max-attempts requires the "app engine" component; if it
# is unavailable on the operator's workstation, run the Firebase CLI command
# above instead. The flags below mirror the firebase CLI command's behavior.
gcloud tasks queues create metaSyncQueue `
    --location=europe-west1 `
    --max-concurrent-dispatches=5 `
    --max-attempts=3 `
    --project=proadsai-saas
```

**Configuration notes**:

- `maxConcurrentDispatches = 5` → protects Meta API rate limits and CF quota.
- `maxAttempts = 3` → 3 retries with exponential backoff is enough for
  transient token/network failures. After 3 attempts the task is marked
  failed; the next 3am sync will retry the account.
- The worker (`functions/src/metaSync/worker.ts`) uses `onTaskDispatched` to
  bind to this queue.

---

## Verification Checklist

Before enabling Phase 14 in production, confirm:

- [ ] KMS key ring exists at `projects/proadsai-saas/locations/europe-west1/keyRings/proads-meta-tokens`
- [ ] KMS key exists and is ENABLED
- [ ] CF service account has `roles/cloudkms.cryptoKeyEncrypterDecrypter` on the key
- [ ] Cloud Tasks queue `metaSyncQueue` exists in `europe-west1`
- [ ] Queue `maxConcurrentDispatches` ≤ 10 (start at 5, scale up if Meta rate limits allow)
- [ ] `tokenCrypto.test.ts` round-trip passes locally (T019) AND against deployed KMS key

Once all green, mark T001 + T002 complete in `specs/phase-14/tasks.md`.