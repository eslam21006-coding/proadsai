// src/pages/Team.tsx — Team management page (owner management + member read-only view)
import React, { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useT } from '../i18n';
import { PLANS, type UserPlan } from '../planconfig';

const fnGetTeamInvites = httpsCallable(functions, 'getTeamInvites');
const fnCreateTeamInvite = httpsCallable(functions, 'createTeamInvite');
const fnResendTeamInvite = httpsCallable(functions, 'resendTeamInvite');
const fnRevokeTeamInvite = httpsCallable(functions, 'revokeTeamInvite');
const fnRemoveTeamMember = httpsCallable(functions, 'removeTeamMember');
// NOTE: updateTeamMemberRole must be added to functions/src/index.ts
const fnUpdateTeamMemberRole = httpsCallable(functions, 'updateTeamMemberRole');

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt?: { seconds: number; nanoseconds: number } | number;
}

interface TeamInviteRow {
  inviteId: string;
  inviteeEmail: string;
  inviteeEmailNormalized: string;
  inviteeName: string;
  role: string;
  status: string;
  createdAt?: { seconds: number; nanoseconds: number } | number;
}

interface ConfirmDialog {
  type: 'remove' | 'revoke';
  targetId: string;
  targetName: string;
}

interface TeamPageProps {
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  user: any;
  userPlan: UserPlan;
  isTeamMember: boolean;
  teamOwnerUid: string | null;
  teamOwnerName: string | null;
  teamRole: string | null;
}

const TeamPage: React.FC<TeamPageProps> = ({
  onClose,
  showToast,
  user,
  userPlan,
  isTeamMember,
  teamOwnerUid,
  teamOwnerName,
  teamRole,
}) => {
  const { t, lang } = useT();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  const ownerUid = isTeamMember ? teamOwnerUid : user?.uid;
  const isOwner = !isTeamMember;
  const maxMembers = PLANS[userPlan]?.features.maxTeamMembers || 0;
  const unlimitedMembers = maxMembers === -1;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [confirm, setConfirm] = useState<ConfirmDialog | null>(null);
  const [roleChanging, setRoleChanging] = useState<string | null>(null);
  const [roleOverride, setRoleOverride] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!ownerUid) return;
    const teamRef = collection(db, 'users', ownerUid, 'team');
    const unsub = onSnapshot(teamRef, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TeamMember));
      setMembers(list);
      setLoading(false);
    }, (err) => {
      console.error('Failed to listen to team:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [ownerUid]);

  const loadInvites = useCallback(async () => {
    if (!isOwner) return;
    try {
      const result = await fnGetTeamInvites({});
      const data = result.data as any;
      setInvites(data.invites || []);
    } catch (e) {
      console.error('Failed to load invites:', e);
    }
  }, [isOwner]);

  useEffect(() => { loadInvites(); }, [loadInvites]);

  const handleInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) {
      showToast('Please enter name and email.', 'error');
      return;
    }
    const openCount = invites.filter(i => ['pending', 'sent', 'failed'].includes(i.status)).length;
    if (!unlimitedMembers && (members.length + openCount) >= maxMembers) {
      setInviteError(
        t('team.limit_reached')
          .replace('{plan}', PLANS[userPlan]?.name || userPlan)
          .replace('{max}', String(maxMembers))
      );
      return;
    }
    setInviting(true);
    setInviteError('');
    try {
      const result = await fnCreateTeamInvite({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });
      const data = result.data as any;
      showToast(
        data.message || `Invite sent to ${inviteEmail.trim()}!`,
        data.deliverySuccess === false ? 'error' : 'success'
      );
      setInviteName('');
      setInviteEmail('');
      setInviteRole('editor');
      loadInvites();
    } catch (e: any) {
      const msg = e?.message || 'Failed to send invite.';
      setInviteError(
        msg.includes('already') ? 'This person is already on your team.'
          : msg.includes('plan') || msg.includes('seat') ? msg
            : 'Failed to send invite.'
      );
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    setProcessing(true);
    try {
      const result = await fnRemoveTeamMember({ memberId });
      const data = result.data as any;
      showToast(data.message || 'Team member removed.', 'success');
    } catch {
      showToast('Failed to remove member.', 'error');
    } finally {
      setConfirm(null);
      setProcessing(false);
    }
  };

  const handleResend = async (inviteId: string) => {
    try {
      const result = await fnResendTeamInvite({ inviteId });
      const data = result.data as any;
      showToast(data.message || 'Resent!', data.success ? 'success' : 'error');
      loadInvites();
    } catch {
      showToast('Failed to resend.', 'error');
    }
  };

  const handleRevoke = async (inviteId: string) => {
    setProcessing(true);
    try {
      const result = await fnRevokeTeamInvite({ inviteId });
      const data = result.data as any;
      showToast(data.message || 'Revoked.', 'success');
      loadInvites();
    } catch {
      showToast('Failed to revoke.', 'error');
    } finally {
      setConfirm(null);
      setProcessing(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    setRoleOverride(prev => ({ ...prev, [memberId]: newRole }));
    setRoleChanging(memberId);
    try {
      await fnUpdateTeamMemberRole({ memberId, role: newRole });
      showToast(
        newRole === 'editor' ? `${t('team.role_member')} role applied.` : `${t('team.role_viewer')} role applied.`,
        'success'
      );
      setRoleOverride(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } catch (e: any) {
      showToast(e?.message || 'Failed to update role.', 'error');
      setRoleOverride(prev => {
        const next = { ...prev };
        delete next[memberId];
        return next;
      });
    } finally {
      setRoleChanging(null);
    }
  };

  const formatDate = (ts?: { seconds: number; nanoseconds: number } | number) => {
    if (!ts) return '—';
    const ms = typeof ts === 'number' ? ts : ts.seconds * 1000;
    return new Date(ms).toLocaleDateString(lang === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  const roleLabel = (role: string) =>
    role === 'editor' ? t('team.role_member') : t('team.role_viewer');

  const statusStyle = (status: string) => {
    const map: Record<string, string> = {
      sent: 'bg-blue-500/10 text-blue-400',
      pending: 'bg-amber-500/10 text-amber-400',
      failed: 'bg-red-500/10 text-red-400',
      expired: 'bg-slate-500/10 text-slate-500',
      revoked: 'bg-slate-500/10 text-slate-400',
      accepted: 'bg-emerald-500/10 text-emerald-400',
    };
    return map[status] || 'bg-slate-500/10 text-slate-400';
  };

  const activeInvites = invites.filter(i => i.status !== 'accepted');
  const seatsUsed = members.length + invites.filter(i => ['pending', 'sent', 'failed'].includes(i.status)).length;

  return (
    <div dir={dir} className="fixed inset-0 z-[200] bg-slate-950 flex flex-col">
      {/* ═══ HEADER ═══ */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800/60 hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition-all"
          >
            <i className={`fa-solid ${dir === 'rtl' ? 'fa-arrow-right' : 'fa-arrow-left'} text-sm`}></i>
          </button>
          <div>
            <h1 className="text-lg font-black text-white flex items-center gap-2">
              <i className="fa-solid fa-users text-emerald-400 text-base"></i>
              {t('team.title')}
            </h1>
            {isTeamMember ? (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {lang === 'ar' ? `عضو في فريق ${teamOwnerName || 'Owner'}` : `Member of ${teamOwnerName || 'Owner'}'s team`}
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 mt-0.5">
                {unlimitedMembers
                  ? `${lang === 'ar' ? 'أعضاء غير محدودين' : 'Unlimited members'} — ${PLANS[userPlan]?.name}`
                  : `${seatsUsed}/${maxMembers} ${lang === 'ar' ? 'مقاعد مستخدمة' : 'seats used'} — ${PLANS[userPlan]?.name}`}
              </p>
            )}
          </div>
        </div>
        {!isTeamMember && maxMembers > 0 && (
          <span className="text-[9px] font-bold uppercase px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 tracking-wider">
            {PLANS[userPlan]?.name}
          </span>
        )}
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto w-full px-6 py-8 space-y-10">

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <>
              {/* ═══ MEMBER LIST ═══ */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-users text-[10px]"></i>
                    {t('team.members')}
                    <span className="text-emerald-400">({members.length + 1})</span>
                  </h2>
                </div>

                <div className="space-y-2">
                  {/* Owner row */}
                  <div className="flex items-center gap-4 bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4">
                    <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <i className="fa-solid fa-crown text-amber-400 text-sm"></i>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white truncate">
                        {isTeamMember
                          ? (teamOwnerName || lang === 'ar' ? 'مالك الفريق' : 'Team Owner')
                          : (user?.displayName || user?.email?.split('@')[0] || lang === 'ar' ? 'أنت' : 'You')}
                      </p>
                      <p className="text-[10px] text-slate-500">{isTeamMember ? '' : user?.email}</p>
                    </div>
                    <span className="text-[8px] font-bold uppercase px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 tracking-wider shrink-0">
                      Owner
                    </span>
                  </div>

                  {/* Member rows */}
                  {members.map((m) => {
                    const displayRole = roleOverride[m.id] || m.role;
                    return (
                      <div
                        key={m.id || m.email}
                        className="flex items-center gap-4 bg-slate-900/40 border border-slate-800 rounded-2xl px-5 py-4 group hover:border-slate-700 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <i className={`fa-solid ${displayRole === 'editor' ? 'fa-pen' : 'fa-eye'} text-emerald-400 text-sm`}></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{m.name || m.email}</p>
                          <p className="text-[10px] text-slate-500">
                            {m.email}
                            {m.joinedAt && (
                              <span className="text-slate-600 ml-2">
                                {lang === 'ar' ? 'انضم' : 'Joined'} {formatDate(m.joinedAt)}
                              </span>
                            )}
                          </p>
                        </div>

                        {isOwner ? (
                          <>
                            <select
                              value={displayRole}
                              onChange={(e) => handleRoleChange(m.id, e.target.value)}
                              disabled={roleChanging === m.id}
                              className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-[10px] font-bold text-white outline-none focus:border-emerald-500/50 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed appearance-none pr-6"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: dir === 'rtl' ? '8px center' : 'calc(100% - 8px) center',
                              }}
                            >
                              <option value="editor">{t('team.role_member')}</option>
                              <option value="viewer">{t('team.role_viewer')}</option>
                            </select>
                            {roleChanging === m.id && (
                              <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full shrink-0"></div>
                            )}
                            <button
                              onClick={() => setConfirm({
                                type: 'remove',
                                targetId: m.id,
                                targetName: m.name || m.email,
                              })}
                              className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all px-1 shrink-0"
                              title={lang === 'ar' ? 'إزالة' : 'Remove'}
                            >
                              <i className="fa-solid fa-xmark text-sm"></i>
                            </button>
                          </>
                        ) : (
                          <span className={`text-[8px] font-bold uppercase px-2.5 py-1 rounded-full ${
                            m.role === 'editor' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
                          } tracking-wider shrink-0`}>
                            {roleLabel(m.role)}
                          </span>
                        )}
                      </div>
                    );
                  })}

                  {members.length === 0 && !isTeamMember && (
                    <div className="text-center py-8 text-slate-600">
                      <i className="fa-solid fa-user-plus text-2xl mb-2 block"></i>
                      <p className="text-xs">{lang === 'ar' ? 'لا يوجد أعضاء بعد' : 'No team members yet'}</p>
                      <p className="text-[10px] text-slate-700 mt-1">
                        {lang === 'ar' ? 'ادعُ أعضاء للانضمام أدناه' : 'Invite members using the form below'}
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* ═══ PENDING INVITES (owner only) ═══ */}
              {isOwner && activeInvites.length > 0 && (
                <section>
                  <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <i className="fa-solid fa-envelope text-[10px]"></i>
                    {t('team.pending_invites')}
                    <span className="text-blue-400">({activeInvites.length})</span>
                  </h2>
                  <div className="space-y-2">
                    {activeInvites.map((inv) => (
                      <div
                        key={inv.inviteId}
                        className="flex items-center gap-4 bg-slate-900/40 border border-slate-800 rounded-2xl px-5 py-4 group hover:border-slate-700 transition-all"
                      >
                        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                          <i className="fa-solid fa-envelope text-blue-400 text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{inv.inviteeName}</p>
                          <p className="text-[10px] text-slate-500">
                            {inv.inviteeEmailNormalized || inv.inviteeEmail}
                            {inv.createdAt && (
                              <span className="text-slate-600 ml-2">
                                {lang === 'ar' ? 'أُرسلت' : 'Sent'} {formatDate(inv.createdAt)}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className={`text-[8px] font-bold uppercase px-2.5 py-1 rounded-full ${statusStyle(inv.status)} tracking-wider shrink-0`}>
                          {inv.status === 'sent' ? (lang === 'ar' ? 'أُرسلت' : 'Sent')
                            : inv.status === 'failed' ? (lang === 'ar' ? 'فشلت' : 'Failed')
                              : inv.status === 'expired' ? (lang === 'ar' ? 'منتهية' : 'Expired')
                                : inv.status === 'revoked' ? (lang === 'ar' ? 'ملغاة' : 'Revoked')
                                  : inv.status === 'pending' ? (lang === 'ar' ? 'معلقة' : 'Pending')
                                    : inv.status}
                        </span>
                        <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          inv.role === 'editor' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-500/10 text-slate-400'
                        } shrink-0`}>
                          {roleLabel(inv.role)}
                        </span>
                        {['pending', 'sent', 'failed'].includes(inv.status) && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => handleResend(inv.inviteId)}
                              className="text-blue-500 hover:text-blue-300 transition-colors px-1.5 py-1 rounded-lg hover:bg-blue-500/10"
                              title={lang === 'ar' ? 'إعادة إرسال' : 'Resend'}
                            >
                              <i className="fa-solid fa-rotate-right text-[10px]"></i>
                            </button>
                            <button
                              onClick={() => setConfirm({
                                type: 'revoke',
                                targetId: inv.inviteId,
                                targetName: inv.inviteeName || inv.inviteeEmailNormalized,
                              })}
                              className="text-slate-600 hover:text-red-400 transition-colors px-1.5 py-1 rounded-lg hover:bg-red-500/10"
                              title={lang === 'ar' ? 'إلغاء' : 'Revoke'}
                            >
                              <i className="fa-solid fa-ban text-[10px]"></i>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* ═══ INVITE FORM (owner only) ═══ */}
              {isOwner && (maxMembers > 0 || unlimitedMembers) && (
                <section className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 space-y-5">
                  <h2 className="text-xs font-black text-emerald-400/80 uppercase tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-user-plus text-[10px]"></i>
                    {t('team.invite_form_title')}
                  </h2>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 block">
                        {lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}
                      </label>
                      <input
                        type="text"
                        value={inviteName}
                        onChange={e => setInviteName(e.target.value)}
                        placeholder={lang === 'ar' ? 'الاسم الكامل' : 'Full name'}
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/30 transition-colors placeholder:text-slate-700"
                      />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1.5 block">
                        {lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                      </label>
                      <input
                        type="email"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-emerald-500/30 transition-colors placeholder:text-slate-700"
                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-2 block">
                      {lang === 'ar' ? 'الدور' : 'Role'}
                    </label>
                    <div className="flex gap-3">
                      {([
                        { key: 'editor' as const, label: t('team.role_member'), icon: 'fa-pen', desc: lang === 'ar' ? 'إنشاء مشاريع وتوليد إعلانات' : 'Create projects & render ads' },
                        { key: 'viewer' as const, label: t('team.role_viewer'), icon: 'fa-eye', desc: lang === 'ar' ? 'عرض المشاريع فقط' : 'View projects only' },
                      ]).map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => setInviteRole(opt.key)}
                          className={`flex-1 p-4 rounded-xl text-left transition-all ${
                            inviteRole === opt.key
                              ? 'bg-emerald-500/10 border border-emerald-500/25'
                              : 'bg-slate-950/60 border border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <i className={`fa-solid ${opt.icon} text-[10px] ${inviteRole === opt.key ? 'text-emerald-400' : 'text-slate-500'}`}></i>
                            <p className={`text-[11px] font-bold ${inviteRole === opt.key ? 'text-emerald-400' : 'text-slate-400'}`}>
                              {opt.label}
                            </p>
                          </div>
                          <p className="text-[9px] text-slate-600">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {inviteError && (
                    <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <i className="fa-solid fa-circle-exclamation text-red-400 text-xs mt-0.5 shrink-0"></i>
                      <p className="text-[11px] text-red-400">{inviteError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleInvite}
                    disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}
                    className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                  >
                    {inviting ? (
                      <>
                        <div className="animate-spin w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></div>
                        {lang === 'ar' ? 'جارٍ الإرسال...' : 'Sending...'}
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-paper-plane"></i>
                        {lang === 'ar' ? 'إرسال الدعوة' : 'Send Invite'}
                      </>
                    )}
                  </button>
                </section>
              )}

              {/* ═══ UPGRADE CTA (owner, plan with no team) ═══ */}
              {isOwner && maxMembers === 0 && !unlimitedMembers && (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8 text-center space-y-4">
                  <i className="fa-solid fa-users text-emerald-400/40 text-3xl"></i>
                  <p className="text-sm text-slate-300">
                    {t('team.not_available')}
                  </p>
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"
                  >
                    <i className="fa-solid fa-arrow-up mr-1.5"></i>
                    {lang === 'ar' ? 'ترقية الخطة' : 'Upgrade Plan'}
                  </button>
                </div>
              )}

              {/* ═══ ROLE LEGEND ═══ */}
              <section className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5">
                <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-4">
                  {lang === 'ar' ? 'صلاحيات الأدوار' : 'Role Permissions'}
                </h3>
                <div className="space-y-3">
                  {[
                    { role: 'Owner', perms: lang === 'ar' ? 'وصول كامل، الفوترة، دعوة أعضاء' : 'Full access, billing, invite members', icon: 'fa-crown', color: 'text-amber-400' },
                    { role: t('team.role_member'), perms: lang === 'ar' ? 'إنشاء مشاريع، توليد إعلانات، كتابة نصوص' : 'Create projects, render ads, write scripts', icon: 'fa-pen', color: 'text-emerald-400' },
                    { role: t('team.role_viewer'), perms: lang === 'ar' ? 'عرض المشاريع والتصميمات فقط' : 'View projects and designs only', icon: 'fa-eye', color: 'text-slate-400' },
                  ].map(r => (
                    <div key={r.role} className="flex items-center gap-3 text-[11px]">
                      <i className={`fa-solid ${r.icon} ${r.color} text-[10px] w-4 text-center`}></i>
                      <span className="text-white font-bold w-16 shrink-0">{r.role}</span>
                      <span className="text-slate-500">{r.perms}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* ═══ TEAM MEMBER BANNER ═══ */}
              {isTeamMember && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-6 text-center space-y-3">
                  <i className="fa-solid fa-circle-info text-blue-400/60 text-xl"></i>
                  <p className="text-sm text-slate-300">
                    {lang === 'ar'
                      ? `أنت عضو في فريق ${teamOwnerName || 'Owner'}. دورك: ${roleLabel(teamRole || 'viewer')}.`
                      : `You are a member of ${teamOwnerName || 'Owner'}'s team. Your role: ${roleLabel(teamRole || 'viewer')}.`}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    {t('team.viewer_tooltip')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ CONFIRMATION DIALOG ═══ */}
      {confirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={() => !processing && setConfirm(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div
            className="relative bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full mx-4 p-6 space-y-5 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center shrink-0">
                <i className={`fa-solid ${confirm.type === 'remove' ? 'fa-user-minus' : 'fa-ban'} text-red-400 text-sm`}></i>
              </div>
              <div>
                <p className="text-sm font-bold text-white">
                  {confirm.type === 'remove'
                    ? (lang === 'ar' ? 'إزالة عضو' : 'Remove Member')
                    : (lang === 'ar' ? 'إلغاء الدعوة' : 'Revoke Invite')}
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {confirm.type === 'remove'
                    ? t('team.remove_confirm').replace('{name}', confirm.targetName)
                    : t('team.revoke_confirm')}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirm(null)}
                disabled={processing}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  if (confirm.type === 'remove') handleRemove(confirm.targetId);
                  else handleRevoke(confirm.targetId);
                }}
                disabled={processing}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>
                    {lang === 'ar' ? 'جارٍ المعالجة...' : 'Processing...'}
                  </>
                ) : (
                  confirm.type === 'remove'
                    ? (lang === 'ar' ? 'إزالة' : 'Remove')
                    : (lang === 'ar' ? 'إلغاء' : 'Revoke')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Team: React.FC<TeamPageProps> = (props) => (
  <TeamPage {...props} />
);

export default Team;
