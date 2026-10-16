/**
 * 批量创建学生账号（本地 Hydro）。用法：
 * docker cp scripts/bulk_create_students_20261014.mjs oj-backend:/tmp/bulk.mjs
 * docker exec -w /opt/hydro oj-backend node /tmp/bulk.mjs
 */
import { createRequire } from 'module';

const require = createRequire('/opt/hydro/node_modules/.bin/hydrooj');
require('@hydrooj/register');

const { default: user, defaultDomainRoleForNewUser, defaultPrivForNewUser } = await import('hydrooj/src/model/user.ts');
const domain = (await import('hydrooj/src/model/domain.ts')).default;
const { Types } = await import('hydrooj/src/service/server.ts');

const PASSWORD = '123456';
const ROLE = defaultDomainRoleForNewUser();

/** [平台学号, 登录用户名] */
const ROWS = [
    [96528, '丁辙'],
    [96529, 'Candy12345'],
    [96531, 'SONGFEIYUFENG'],
    [96568, 'Evan_Z'],
    [96581, '崔沐晨'],
    [96585, '杨牧轩'],
    [96620, 'zrx140320'],
    [96623, 'cxj'],
    [96659, '13584683040'],
    [96699, 'southware'],
    [96714, 'syc2012'],
    [96741, '韩家成'],
    [96742, 'jason2014'],
    [96780, '马孙靓'],
    [96821, 'qinchenhao'],
    [97220, '周逸轩zyx'],
    [100160, 'syc22'],
    [100171, '黎子轩'],
    [105335, '晨晨@'],
    [115838, 'zjsy'],
    [115839, 'zzm2025'],
    [115840, 'qrf'],
    [115841, 'xyc2025'],
    [115842, 'qyy2025'],
    [118102, 'yueyc'],
    [118103, 'gongjz'],
    [118105, 'mas'],
    [118106, 'caizr'],
    [118107, 'zhush'],
    [118108, 'liujy@magao'],
    [118109, 'liujh'],
    [118110, 'xuyf'],
    [118112, 'zhouhy'],
    [118116, 'shenqf'],
    [118117, 'chente'],
    [118118, 'liubyx'],
    [118119, 'zhuc'],
    [118120, 'jiangyh'],
    [118121, 'wuld'],
    [118122, 'yejh'],
    [120351, 'wzy_1231'],
    [120799, 'dengdingchi'],
    [120800, 'zhangwei@magao'],
    [120801, 'dinglirui'],
    [120802, 'gaoyichen'],
    [120803, 'shengzirui'],
    [120804, 'chengdongni'],
    [120805, 'xuehuiyan'],
    [122838, 'zhangwei_magao'],
    [128996, 'dujiaxuan_magao'],
    [129848, 'liucm'],
    [130850, 'qsl123456'],
    [130949, 'sunhaoyu'],
    [130950, 'guhongzhe'],
    [130951, 'qinrui'],
    [130952, 'chenxinhui'],
    [131128, 'tianyiyou2026'],
    [131173, '袁熔'],
    [131254, 'youyang2026'],
    [131325, 'dengdingchi2026'],
    [133297, '徐浩桐'],
    [133573, 'zhangjiaming'],
    [134703, 'Zhaoyw'],
];

function loginName(raw, sid) {
    const u = String(raw || '').trim();
    if (u && Types.Username[1](u)) return u;
    const ascii = u.replace(/@/g, '_at_').replace(/[^\w\u4e00-\u9fff.-]/g, '_');
    if (ascii && Types.Username[1](ascii)) return ascii;
    return `u${sid}`;
}

function mailFor(sid) {
    return `s${sid}@magao.student`;
}

const log = [];
for (const [sid, display] of ROWS) {
    const uname = loginName(display, sid);
    const mail = mailFor(sid);
    try {
        const exists = await user.getByUname('system', uname);
        if (exists) {
            await domain.setUserInDomain('system', exists._id, { join: true, role: ROLE });
            await user.setById(exists._id, { studentId: String(sid) });
            log.push(`skip-exists\t${sid}\t${uname}\tuid=${exists._id}`);
            continue;
        }
        const byMail = await user.getByEmail('system', mail);
        if (byMail) {
            log.push(`skip-mail\t${sid}\t${mail}\tuid=${byMail._id}`);
            continue;
        }
        const uid = await user.create(mail, uname, PASSWORD, undefined, '127.0.0.1', defaultPrivForNewUser());
        await user.setById(uid, { studentId: String(sid) });
        if (display && display !== uname) {
            await domain.setUserInDomain('system', uid, { displayName: display });
        }
        log.push(`created\t${sid}\t${uname}\tuid=${uid}`);
    } catch (e) {
        log.push(`error\t${sid}\t${uname}\t${e?.message || e}`);
    }
}

console.log(log.join('\n'));
console.log(`done ${log.filter((l) => l.startsWith('created')).length} created, ${log.filter((l) => l.startsWith('skip')).length} skipped, ${log.filter((l) => l.startsWith('error')).length} errors`);
