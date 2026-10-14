/** 仅域管理员可访问的页面路径（学生/教师误进时回首页） */
export function isDomainAdminPath(pathname: string) {
    const p = (pathname || '').split('?')[0];
    if (/^\/domain\/(dashboard|edit|user|permission|role|group|join_applications|avatar)\/?$/.test(p)) return true;
    if (/^\/home\/(edit|layout|hero\/upload)\/?$/.test(p)) return true;
    if (p.startsWith('/home/edit/')) return true;
    return false;
}

export function loginRedirectForUser(pathOrUrl: string, hasEditDomain: boolean, homepageUrl: string) {
    if (!pathOrUrl) return pathOrUrl;
    const path = pathOrUrl.startsWith('http') ? new URL(pathOrUrl).pathname : pathOrUrl.split('?')[0];
    if (isDomainAdminPath(path) && !hasEditDomain) return homepageUrl;
    return pathOrUrl;
}
