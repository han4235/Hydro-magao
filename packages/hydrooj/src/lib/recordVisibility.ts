import { PERM } from '../model/builtin';

function configuredTeacherRole(): string {
    const role = global.Hydro?.model?.system?.get('default.teacherRole');
    return typeof role === 'string' && role.trim() ? role.trim() : '教师';
}

/** 域内可查看全部用户评测记录（列表筛选他人、单条详情） */
export function canViewAllDomainRecords(user: { hasPerm: (perm: bigint) => boolean; role: string }): boolean {
    if (user.hasPerm(PERM.PERM_VIEW_RECORD)) return true;
    if (user.role === 'root') return true;
    return user.role === configuredTeacherRole();
}
