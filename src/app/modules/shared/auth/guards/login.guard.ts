import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AppService } from '../../services/services/appService';

/**
 * Login Guard (no-auth guard)
 *  - Redirects to /dashboard if user already has a valid token
 *  - Allows navigation to /login when not authenticated
 */
export const loginGuard: CanActivateFn = async () => {
  const appService = inject(AppService);
  const router = inject(Router);

  try {
    const isAuthorized = await lastValueFrom(appService.isAuthorized());
    if (isAuthorized) {
      return router.parseUrl('/dashboard');
    }
    return true;
  } catch {
    return true;
  }
};
