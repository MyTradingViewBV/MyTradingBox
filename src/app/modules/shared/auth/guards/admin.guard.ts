import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AppService } from '../../services/services/appService';

/**
 * Admin Guard
 *  - Redirects to /dashboard if the authenticated user is not an Admin
 *  - Must be used in combination with authGuard (which handles unauthenticated users)
 */
export const adminGuard: CanActivateFn = async () => {
  const appService = inject(AppService);
  const router = inject(Router);

  const isAdmin = await lastValueFrom(appService.isAdmin());
  if (isAdmin) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
