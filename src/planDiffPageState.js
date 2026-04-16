export const PLAN_DIFF_PAGE_STORAGE_KEY = 'SDD:plan-diff-page';
export const PLAN_DIFF_PAGE_ROUTE = '/diff-tab';
export const PLAN_DIFF_PAGE_ALIASES = [PLAN_DIFF_PAGE_ROUTE, '/plan-diff'];

export function isPlanDiffPagePath(pathname = '/') {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  return PLAN_DIFF_PAGE_ALIASES.includes(normalizedPath);
}
