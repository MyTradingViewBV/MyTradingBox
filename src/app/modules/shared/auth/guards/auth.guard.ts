import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AppService } from '../../services/services/appService';

/**
 * Auth Guard
 *  - Redirects to /login if user not authorized
 *  - Allows navigation when token is valid
 */
export const authGuard: CanActivateFn = async () => {
  const appService = inject(AppService);
  const router = inject(Router);

  try {
    const isAuthorized = await lastValueFrom(appService.isAuthorized());
    if (isAuthorized) {
      return true;
    }
    return router.parseUrl('/login');
  } catch {
    // On unexpected error force logout & redirect
    appService.logout();
    return router.parseUrl('/login');
  }
};
