# myTradingBox

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 20.0.5.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.


https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/swagger/index.html

https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/Symbols
alleen     "RunStatus": "BoxesCollected"

https://botapi-f3fkahc9eadkfveh.swedencentral-01.azurewebsites.net/Candles/bybit?symbol=BTCUSDT&timeframe=1h&limit=100

volgend:

https://www.youtube.com/watch?v=zntqdl24r78&list=PL7bl1VAGv7sMN9Z2FX3Memjmvl_qeZote&ab_channel=JaysonCasper 



Boxes moeten alleen opgehaald worden van de 1d grafiek (dus elk timeframe moet kijken naar de boxes van de 1d timeframe)

Boxes moeten alleen getoond worden waar Type = "Range"

## Onboarding Info Pages

Na de eerste succesvolle login verschijnt een overlay met 5 korte informatie pagina's.

Locatie componenten:
- Container: `src/app/components/onboarding/onboarding.component.*`
- Stappen: `src/app/components/onboarding/steps/info-stepX.component.ts`

Functionaliteit:
1. Overlay verschijnt alleen als `localStorage['onboardingDone'] !== 'true'`.
2. Elke stap toont mock uitleg (charts, orders, thema, enz.).
3. "Volgende" doorloopt stappen; laatste knop heet "Afronden".
4. "×" (skip) en afronden zetten `localStorage.setItem('onboardingDone','true')`.
5. Wordt niet opnieuw getoond bij volgende sessies.

Aanpassen / resetten:
```ts
localStorage.removeItem('onboardingDone'); // Forceer opnieuw tonen
```

Styling staat in `onboarding.component.scss` (donkere overlay, panel). Voeg extra stappen toe door nieuw component aan te maken en te importeren in `onboarding.component.ts` plus een extra `*ngSwitchCase`.

## Theme Toggling

The app supports multiple Angular Material 3 themes you can switch at runtime:

- Dark (class: `dark-theme`)
- Light Blue (class: `theme-light-blue`)
- Green (class: `theme-green`)
- Purple (class: `theme-purple`)

### How it works
- Global theme definitions live in `src/styles.scss` using `mat.define-theme`.
- A `ThemeService` (`src/app/services/theme.service.ts`) manages applying a single theme class to `<body>` and to the CDK overlay container.
- The Settings page (`settings.component.html`) contains buttons that call `theme.applyTheme(name)`.
- The active theme is persisted in `localStorage` under key `app.theme`.

### Adding a new theme
1. Open `src/styles.scss`.
2. Define a new theme variable:
	```scss
	$my-theme: mat.define-theme(( color: ( theme-type: light, primary: mat.$blue-palette, tertiary: mat.$orange-palette ) ));
	```
3. Add a class wrapping includes:
	```scss
	.theme-my {
	  @include mat.system-level-colors($my-theme);
	  @include mat.theme($my-theme);
	  @include mat.all-component-themes($my-theme);
	}
	```
4. Add the class to the mapping list (where system tokens are mapped) if needed.
5. Update the `themes` array in `ThemeService` to include `'my'`.
6. Add a button in `settings.component.html`:
	```html
	<button mat-stroked-button (click)="setTheme('my')">My Theme</button>
	```

### Token usage
Use the mapped CSS custom properties for consistent colors (e.g., `var(--sys-primary)`, `var(--sys-surface)`).

### Troubleshooting
- If you see Sass errors about undefined palette variables, ensure the palette exists in the version of Angular Material you're using. Swap to a known palette like `mat.$blue-palette` or `mat.$green-palette`.
- Always remove previous theme classes before applying a new one (handled by `ThemeService`).

### Programmatic switch
```ts
constructor(private theme: ThemeService) {
  this.theme.applyTheme('green');
}
```