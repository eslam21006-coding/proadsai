// src/services/teamService.ts
// Team management Cloud Function wrappers.

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

const fnGetInviteDetails = httpsCallable(functions, 'getInviteDetails');
const fnCreateTeamInvite = httpsCallable(functions, 'createTeamInvite');
const fnResendTeamInvite = httpsCallable(functions, 'resendTeamInvite');
const fnRevokeTeamInvite = httpsCallable(functions, 'revokeTeamInvite');
const fnClaimTeamInvite = httpsCallable(functions, 'claimTeamInvite');
const fnGetTeamInvites = httpsCallable(functions, 'getTeamInvites');
const fnRemoveTeamMember = httpsCallable(functions, 'removeTeamMember');
const fnUpdateTeamMemberRole = httpsCallable(functions, 'updateTeamMemberRole');

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

export interface CreateInviteResult {
    success: boolean;
    inviteId?: string;
    deliverySuccess?: boolean;
    message?: string;
}

export async function createTeamInvite(data: { email: string; name: string; role: string }): Promise<CreateInviteResult> {
    const result = await fnCreateTeamInvite(data);
    return result.data as CreateInviteResult;
}

export async function resendTeamInvite(inviteId: string): Promise<{ success: boolean; message?: string }> {
    const result = await fnResendTeamInvite({ inviteId });
    return result.data as { success: boolean; message?: string };
}

export async function revokeTeamInvite(inviteId: string): Promise<{ success: boolean; message?: string }> {
    const result = await fnRevokeTeamInvite({ inviteId });
    return result.data as { success: boolean; message?: string };
}

export interface ClaimInviteResult {
    success: boolean;
    claimed?: number;
    message?: string;
}

export async function claimTeamInvite(inviteId?: string): Promise<ClaimInviteResult> {
    const result = await fnClaimTeamInvite(inviteId ? { inviteId } : {});
    return result.data as ClaimInviteResult;
}

export async function getTeamInvites(): Promise<{ invites: any[] }> {
    const result = await fnGetTeamInvites({});
    return result.data as { invites: any[] };
}

export async function removeTeamMember(memberId: string): Promise<{ success: boolean; message?: string }> {
    const result = await fnRemoveTeamMember({ memberId });
    return result.data as { success: boolean; message?: string };
}

export async function updateTeamMemberRole(memberId: string, role: string): Promise<{ success: boolean; message?: string }> {
    const result = await fnUpdateTeamMemberRole({ memberId, role });
    return result.data as { success: boolean; message?: string };
}
