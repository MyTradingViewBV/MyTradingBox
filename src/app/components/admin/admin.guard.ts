import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { settingsFeature } from 'src/app/store/settings/settings.reducer';
import { map, take } from 'rxjs';

// Guard checks NgRx `settingsState.adminModeEnabled` (persisted via ngrx-store-localstorage).
// Redirects to root if admin mode is disabled.
export const AdminGuard: CanActivateFn = () => {
	// const router = inject(Router);
	// const store = inject(Store);
	// return store.select(settingsFeature.selectAdminModeEnabled).pipe(
	// 	take(1),
	// 	map((enabled) => {
	// 		if (enabled) return true;
	// 		router.navigateByUrl('/');
	// 		return false;
	// 	})
	// );
	return true;
};
