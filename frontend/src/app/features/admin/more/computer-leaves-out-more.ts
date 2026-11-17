import { inject } from '@angular/core';
import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { CompactLayout } from '../../../core/layout/compact-layout';
import { ADMIN_HOME_PATH } from '../shell/admin-sections';

export const computerLeavesOutMore: CanActivateFn = () => {
  if (inject(CompactLayout).isCompact()) {
    return true;
  }
  const router = inject(Router);
  return new RedirectCommand(router.parseUrl(ADMIN_HOME_PATH), { replaceUrl: true });
};
