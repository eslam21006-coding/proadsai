// src/services/teamService.ts
// Team management Cloud Function wrappers.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const fnGetInviteDetails = httpsCallable(functions, 'getInviteDetails');

export interface InviteDetailsResult {
    success: boolean;
    status?: string;
    message?: string;
    ownerName?: string;
    inviteeEmail?: string;
    inviteeName?: string;
    teamPlan?: string;
    role?: string;
    expiresAt?: number;
}

export async function getInviteDetails(inviteId: string): Promise<InviteDetailsResult> {
    const result = await fnGetInviteDetails({ inviteId });
    return result.data as InviteDetailsResult;
}
