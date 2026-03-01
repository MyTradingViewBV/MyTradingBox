import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FooterComponent } from './footer-compenent';
import { SwUpdate } from '@angular/service-worker';
import { Router } from '@angular/router';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

class MockSwUpdate {} // minimal stub

class MockRouter {
  navigate(path: string[]) { return Promise.resolve(true); }
}

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let router: MockRouter;
  let compiled: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        { provide: SwUpdate, useClass: MockSwUpdate },
        { provide: Router, useClass: MockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router) as any;
    compiled = fixture.debugElement;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render footer element', () => {
      const footer = compiled.query(By.css('footer.app-footer'));
      expect(footer).toBeTruthy();
    });
  });

  describe('Navigation Buttons', () => {
    it('should render all navigation buttons', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons.length).toBe(5);
    });

    it('should have chart navigation button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons[0].nativeElement.textContent).toContain('Grafiek');
    });

    it('should have orders navigation button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons[1].nativeElement.textContent).toContain('Orders');
    });

    it('should have watchlist navigation button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons[2].nativeElement.textContent).toContain('Watchlist');
    });

    it('should have balance navigation button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons[3].nativeElement.textContent).toContain('Balance');
    });

    it('should have settings navigation button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      expect(buttons[4].nativeElement.textContent).toContain('Settings');
    });

    it('should display all button icons', () => {
      const icons = compiled.queryAll(By.css('.icon'));
      expect(icons.length).toBe(5);
      expect(icons[0].nativeElement.textContent).toContain('📊');
      expect(icons[1].nativeElement.textContent).toContain('💼');
      expect(icons[2].nativeElement.textContent).toContain('👁️');
      expect(icons[3].nativeElement.textContent).toContain('💰');
      expect(icons[4].nativeElement.textContent).toContain('⚙️');
    });
  });

  describe('Navigation Functionality', () => {
    it('should navigate to chart on button click', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));
      spyOn(console, 'log');

      component.navigate('chart');

      expect(console.log).toHaveBeenCalledWith('navigating to', 'chart');
      expect(router.navigate).toHaveBeenCalledWith(['/chart']);
    });

    it('should navigate to orders on button click', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('orders');

      expect(router.navigate).toHaveBeenCalledWith(['/orders']);
    });

    it('should navigate to watchlist on button click', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('watchlist');

      expect(router.navigate).toHaveBeenCalledWith(['/watchlist']);
    });

    it('should navigate to balance on button click', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('balance');

      expect(router.navigate).toHaveBeenCalledWith(['/balance']);
    });

    it('should navigate to dashboard on button click', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('dashboard');

      expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it('should navigate with custom route', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('custom-route');

      expect(router.navigate).toHaveBeenCalledWith(['/custom-route']);
    });

    it('should log navigation message', () => {
      spyOn(console, 'log');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('test');

      expect(console.log).toHaveBeenCalledWith('navigating to', 'test');
    });
  });

  describe('Button Click Events', () => {
    it('should call navigate when chart button is clicked', () => {
      spyOn(component, 'navigate');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons[0].nativeElement.click();

      expect(component.navigate).toHaveBeenCalledWith('chart');
    });

    it('should call navigate when orders button is clicked', () => {
      spyOn(component, 'navigate');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons[1].nativeElement.click();

      expect(component.navigate).toHaveBeenCalledWith('orders');
    });

    it('should call navigate when watchlist button is clicked', () => {
      spyOn(component, 'navigate');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons[2].nativeElement.click();

      expect(component.navigate).toHaveBeenCalledWith('watchlist');
    });

    it('should call navigate when balance button is clicked', () => {
      spyOn(component, 'navigate');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons[3].nativeElement.click();

      expect(component.navigate).toHaveBeenCalledWith('balance');
    });

    it('should call navigate when settings button is clicked', () => {
      spyOn(component, 'navigate');
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons[4].nativeElement.click();

      expect(component.navigate).toHaveBeenCalledWith('dashboard');
    });
  });

  describe('CSS Classes', () => {
    it('should have app-footer class on footer element', () => {
      const footer = compiled.query(By.css('footer'));
      expect(footer.nativeElement.classList.contains('app-footer')).toBeTrue();
    });

    it('should have footer-btn class on all buttons', () => {
      const buttons = compiled.queryAll(By.css('button'));
      buttons.forEach(button => {
        expect(button.nativeElement.classList.contains('footer-btn')).toBeTrue();
      });
    });

    it('should have icon class on all icon spans', () => {
      const icons = compiled.queryAll(By.css('span.icon'));
      expect(icons.length).toBe(5);
      icons.forEach(icon => {
        expect(icon.nativeElement.classList.contains('icon')).toBeTrue();
      });
    });

    it('should have label class on all label spans', () => {
      const labels = compiled.queryAll(By.css('span.label'));
      expect(labels.length).toBe(5);
      labels.forEach(label => {
        expect(label.nativeElement.classList.contains('label')).toBeTrue();
      });
    });
  });

  describe('Button Attributes', () => {
    it('should have type button on all buttons', () => {
      const buttons = compiled.queryAll(By.css('button'));
      buttons.forEach(button => {
        expect(button.nativeElement.getAttribute('type')).toBe('button');
      });
    });

    it('should have button elements in footer', () => {
      const buttons = compiled.queryAll(By.css('footer button'));
      expect(buttons.length).toBe(5);
    });
  });

  describe('Router Integration', () => {
    it('should handle navigation promise resolution', async () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      const result = component.navigate('chart');

      // navigate doesn't return anything, but verify it calls router.navigate
      expect(router.navigate).toHaveBeenCalledWith(['/chart']);
    });

    it('should handle multiple consecutive navigations', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('chart');
      component.navigate('orders');
      component.navigate('watchlist');

      expect(router.navigate).toHaveBeenCalledTimes(3);
      expect(router.navigate).toHaveBeenCalledWith(['/chart']);
      expect(router.navigate).toHaveBeenCalledWith(['/orders']);
      expect(router.navigate).toHaveBeenCalledWith(['/watchlist']);
    });

    it('should prepend slash to route', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('test');

      const call = (router.navigate as jasmine.Spy).calls.mostRecent();
      expect(call.args[0][0]).toEqual('/test');
    });
  });

  describe('Error Handling', () => {
    it('should handle navigation with empty string', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('');

      expect(router.navigate).toHaveBeenCalledWith(['/']);
    });

    it('should handle navigation with special characters', () => {
      spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

      component.navigate('test-route');

      expect(router.navigate).toHaveBeenCalledWith(['/test-route']);
    });
  });

  describe('Accessibility', () => {
    it('should have proper button elements for accessibility', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      buttons.forEach(button => {
        expect(button.nativeElement.tagName.toLowerCase()).toBe('button');
      });
    });

    it('should have visible text labels for all buttons', () => {
      const labels = compiled.queryAll(By.css('.label'));
      const expectedLabels = ['Grafiek', 'Orders', 'Watchlist', 'Balance', 'Settings'];
      
      labels.forEach((label, index) => {
        expect(label.nativeElement.textContent.trim()).toContain(expectedLabels[index]);
      });
    });
  });

  describe('Template Structure', () => {
    it('should render footer with correct structure', () => {
      const footer = compiled.query(By.css('footer.app-footer'));
      const buttons = footer.queryAll(By.css('.footer-btn'));
      
      expect(buttons.length).toBe(5);
      buttons.forEach(button => {
        const icon = button.query(By.css('.icon'));
        const label = button.query(By.css('.label'));
        expect(icon).toBeTruthy();
        expect(label).toBeTruthy();
      });
    });

    it('should have icon and label for each button', () => {
      const buttons = compiled.queryAll(By.css('.footer-btn'));
      
      buttons.forEach(button => {
        const icons = button.queryAll(By.css('.icon'));
        const labels = button.queryAll(By.css('.label'));
        expect(icons.length).toBe(1);
        expect(labels.length).toBe(1);
      });
    });
  });

  describe('Navigation Routes', () => {
    const routeTests = [
      { route: 'chart', expectedPath: ['/chart'] },
      { route: 'orders', expectedPath: ['/orders'] },
      { route: 'watchlist', expectedPath: ['/watchlist'] },
      { route: 'balance', expectedPath: ['/balance'] },
      { route: 'dashboard', expectedPath: ['/dashboard'] },
    ];

    routeTests.forEach(test => {
      it(`should navigate to ${test.route}`, () => {
        spyOn(router, 'navigate').and.returnValue(Promise.resolve(true));

        component.navigate(test.route);

        expect(router.navigate).toHaveBeenCalledWith(test.expectedPath);
      });
    });
  });
});
