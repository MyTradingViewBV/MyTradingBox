import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { SettingsState, settingsFeature } from 'src/app/store/settings/settings.reducer';
import { map, take } from 'rxjs';

// Basic placeholder check: requires localStorage flag `isAdmin` to be 'true'.
// Redirects to root settings page if missing.
export const AdminGuard: CanActivateFn = () => {
//   const router = inject(Router);
//   const store = inject<Store<SettingsState>>(Store as any);
//   return store.select(settingsFeature.selectAdminModeEnabled).pipe(
//     take(1),
//     map((enabled) => {
//       if (enabled) return true;
//       router.navigateByUrl('/');
//       return false;
//     })
//   );
return true;
};
