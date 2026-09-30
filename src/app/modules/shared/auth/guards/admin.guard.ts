import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { lastValueFrom } from 'rxjs';
import { AppService } from '../../services/services/appService';

/**
 * Admin Guard
 *  - Redirects to /dashboard if the authenticated user is not an Admin
 *  - Also redirects when the admin check itself fails (fails closed)
 *  - Must be used in combination with authGuard (which handles unauthenticated users)
 */
export const adminGuard: CanActivateFn = async () => {
  const appService = inject(AppService);
  const router = inject(Router);

  try {
    const isAdmin = await lastValueFrom(appService.isAdmin());
    if (isAdmin) {
      return true;
    }
  } catch (err) {
    console.warn('[adminGuard] Admin check failed; redirecting', err);
  }
  return router.parseUrl('/dashboard');
};
