import { PERM, PRIV, STATUS } from 'hydrooj';
import type { ProblemStatusDoc, RecordDoc } from 'hydrooj/src/interface';
import { canViewAllDomainRecords } from 'hydrooj/src/lib/recordVisibility';

type RecordCodeViewer = {
    hasPerm: (perm: bigint) => boolean;
    hasPriv: (priv: number) => boolean;
    role: string;
};

/** 在该题取得满分（AC 或得分 ≥100） */
export function userHasFullScoreOnProblem(psdoc?: ProblemStatusDoc | null) {
    if (!psdoc) return false;
    if (psdoc.status === STATUS.STATUS_ACCEPTED) return true;
    return typeof psdoc.score === 'number' && psdoc.score >= 100;
}

export function canViewRecordSourceCode(
    user: RecordCodeViewer,
    rdoc: RecordDoc,
    psdoc: ProblemStatusDoc | null | undefined,
    isOwnOrTeammate: boolean,
) {
    if (isOwnOrTeammate) return true;
    if (canViewAllDomainRecords(user)) return true;
    if (user.hasPriv(PRIV.PRIV_READ_RECORD_CODE)) return true;
    if (user.hasPerm(PERM.PERM_READ_RECORD_CODE)) return true;
    if (user.hasPerm(PERM.PERM_READ_RECORD_CODE_ACCEPT) && userHasFullScoreOnProblem(psdoc)) return true;
    if (!rdoc.contest && userHasFullScoreOnProblem(psdoc)) return true;
    return false;
}

/** 题库练习（非比赛）提交：允许查看他人记录详情（评测信息），不要求 PERM_VIEW_RECORD */
export function canViewPracticeRecordDetail(
    user: RecordCodeViewer & { hasPerm: (perm: bigint) => boolean },
    rdoc: RecordDoc,
    isOwnOrTeammate: boolean,
) {
    if (isOwnOrTeammate) return true;
    if (canViewAllDomainRecords(user)) return true;
    if (rdoc.contest) return false;
    return user.hasPerm(PERM.PERM_VIEW_PROBLEM);
}
