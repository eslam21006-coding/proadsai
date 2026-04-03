# Contract: getInviteDetails

**Type**: Cloud Function (onCall, unauthenticated)
**Location**: `functions/src/index.ts`

## Request

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inviteId | string | Yes | The invite ID from the URL query parameter |

## Response (success)

```ts
{
  success: true;
  ownerName: string;
  inviteeEmail: string;
  inviteeName: string;
  teamPlan: string;
  role: 'editor' | 'viewer';
  status: 'pending' | 'sent';
  expiresAt: number; // Unix timestamp ms
}
```

## Response (invalid invite)

```ts
{
  success: false;
  status: 'expired' | 'revoked' | 'accepted' | 'not_found';
  message: string; // Human-readable reason
}
```

## Security

- Does NOT require authentication (invite link is the access token)
- Does NOT expose: ownerId, ownerEmail, claimedByUserId, delivery details
- Rate-limited by default Cloud Function rate limiting
- Returns `not_found` for non-existent invite IDs (no information leakage about existence vs. invalidity)

## Behavior

- If `expiresAt` is in the past, return `status: 'expired'`
- If invite status is `revoked`, return `status: 'revoked'`
- If invite status is `accepted`, return `status: 'accepted'`
- If invite not found, return `status: 'not_found'`
- Only return full details for claimable invites (`pending` or `sent` status with valid expiry)
