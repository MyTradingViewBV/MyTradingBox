import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContactComponent } from './contact.component';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { DebugElement } from '@angular/core';
import { By } from '@angular/platform-browser';

class MockRouter {
  navigate(path: string[]) { return Promise.resolve(true); }
}

class MockLocation {
  back() {}
}

describe('ContactComponent', () => {
  let component: ContactComponent;
  let fixture: ComponentFixture<ContactComponent>;
  let location: MockLocation;
  let compiled: DebugElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContactComponent],
      providers: [
        { provide: Router, useClass: MockRouter },
        { provide: Location, useClass: MockLocation },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactComponent);
    component = fixture.componentInstance;
    location = TestBed.inject(Location) as any;
    compiled = fixture.debugElement;
    fixture.detectChanges();
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render contact page container', () => {
      const contactPage = compiled.query(By.css('.contact-page'));
      expect(contactPage).toBeTruthy();
    });

    it('should render header section', () => {
      const header = compiled.query(By.css('.wl-header'));
      expect(header).toBeTruthy();
    });

    it('should display contact page title', () => {
      const title = compiled.query(By.css('.wl-title'));
      expect(title.nativeElement.textContent).toContain('Contact');
    });
  });

  describe('Header Navigation', () => {
    it('should render back button', () => {
      const backButton = compiled.query(By.css('.wl-btn'));
      expect(backButton).toBeTruthy();
    });

    it('should have back button with correct aria-label', () => {
      const backButton = compiled.query(By.css('.wl-btn'));
      expect(backButton.nativeElement.getAttribute('aria-label')).toBe('Back');
    });

    it('should display back button symbol', () => {
      const backButton = compiled.query(By.css('.wl-btn'));
      expect(backButton.nativeElement.textContent).toContain('↩');
    });

    it('should call back method on button click', () => {
      spyOn(component, 'back');
      spyOn(location, 'back');

      const backButton = compiled.query(By.css('.wl-btn'));
      backButton.nativeElement.click();

      expect(component.back).toHaveBeenCalled();
    });

    it('should navigate back using location service', () => {
      spyOn(location, 'back');

      component.back();

      expect(location.back).toHaveBeenCalled();
    });
  });

  describe('Contact Information Section', () => {
    it('should render contact info section', () => {
      const section = compiled.query(By.css('.contact-info'));
      expect(section).toBeTruthy();
    });

    it('should have glass class on contact info section', () => {
      const section = compiled.query(By.css('.contact-info'));
      expect(section.nativeElement.classList.contains('glass')).toBeTrue();
    });

    it('should display section title', () => {
      const title = compiled.query(By.css('.section-title'));
      expect(title.nativeElement.textContent).toContain('Get in touch');
    });
  });

  describe('Contact Information Items', () => {
    it('should render items container', () => {
      const items = compiled.query(By.css('.items'));
      expect(items).toBeTruthy();
    });

    it('should render all contact info rows', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      expect(rows.length).toBe(6);
    });

    it('should display email information', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const emailRow = rows[0];
      const label = emailRow.query(By.css('.label'));
      const value = emailRow.query(By.css('.value'));
      
      expect(label.nativeElement.textContent).toContain('Email');
      expect(value.nativeElement.textContent).toContain('support@mytradingbox.app');
    });

    it('should display support hours information', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const hoursRow = rows[1];
      const label = hoursRow.query(By.css('.label'));
      const value = hoursRow.query(By.css('.value'));
      
      expect(label.nativeElement.textContent).toContain('Support Hours');
      expect(value.nativeElement.textContent).toContain('Mon–Fri, 09:00–18:00 CET');
    });

    it('should display status page link', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const statusRow = rows[2];
      const link = statusRow.query(By.css('a'));
      
      expect(link).toBeTruthy();
      expect(link.nativeElement.href).toContain('status.mytradingbox.app');
      expect(link.nativeElement.getAttribute('target')).toBe('_blank');
      expect(link.nativeElement.getAttribute('rel')).toBe('noopener');
    });

    it('should display status page text', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const statusRow = rows[2];
      const value = statusRow.query(By.css('.value'));
      
      expect(value.nativeElement.textContent).toContain('status.mytradingbox.app');
    });

    it('should display FAQ link', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const faqRow = rows[3];
      const link = faqRow.query(By.css('a'));
      
      expect(link).toBeTruthy();
      expect(link.nativeElement.getAttribute('routerlink')).toBe('/help/faq');
    });

    it('should display FAQ text', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const faqRow = rows[3];
      const link = faqRow.query(By.css('a'));
      
      expect(link.nativeElement.textContent).toContain('Read FAQs');
    });

    it('should display community links', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const communityRow = rows[4];
      const links = communityRow.queryAll(By.css('a'));
      
      expect(links.length).toBe(2);
      expect(links[0].nativeElement.href).toContain('twitter.com/MyTradingBox');
      expect(links[1].nativeElement.href).toContain('discord.gg');
    });

    it('should display Twitter link text', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const communityRow = rows[4];
      const links = communityRow.queryAll(By.css('a'));
      
      expect(links[0].nativeElement.textContent).toContain('Twitter');
    });

    it('should display Discord link text', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const communityRow = rows[4];
      const links = communityRow.queryAll(By.css('a'));
      
      expect(links[1].nativeElement.textContent).toContain('Discord');
    });

    it('should display security warning', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const securityRow = rows[5];
      const label = securityRow.query(By.css('.label'));
      const value = securityRow.query(By.css('.value'));
      
      expect(label.nativeElement.textContent).toContain('Security');
      expect(value.nativeElement.textContent).toContain('Never share API keys or passwords');
    });

    it('should display full security message', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const securityRow = rows[5];
      const value = securityRow.query(By.css('.value'));
      
      expect(value.nativeElement.textContent).toContain('seed phrase');
    });
  });

  describe('CSS Classes and Structure', () => {
    it('should have correct label class on all labels', () => {
      const labels = compiled.queryAll(By.css('.label'));
      expect(labels.length).toBeGreaterThan(0);
      labels.forEach(label => {
        expect(label.nativeElement.classList.contains('label')).toBeTrue();
      });
    });

    it('should have correct value class on all values', () => {
      const values = compiled.queryAll(By.css('.value'));
      expect(values.length).toBeGreaterThan(0);
      values.forEach(value => {
        expect(value.nativeElement.classList.contains('value')).toBeTrue();
      });
    });

    it('should have correct item-left class', () => {
      const itemLefts = compiled.queryAll(By.css('.item-left'));
      expect(itemLefts.length).toBe(6);
      itemLefts.forEach(item => {
        expect(item.nativeElement.classList.contains('item-left')).toBeTrue();
      });
    });

    it('should have correct item-right class', () => {
      const itemRights = compiled.queryAll(By.css('.item-right'));
      expect(itemRights.length).toBe(6);
      itemRights.forEach(item => {
        expect(item.nativeElement.classList.contains('item-right')).toBeTrue();
      });
    });

    it('should have spacer element in header', () => {
      const spacer = compiled.query(By.css('.spacer'));
      expect(spacer).toBeTruthy();
    });
  });

  describe('Link Attributes', () => {
    it('should have correct target and rel attributes on external links', () => {
      const externalLinks = compiled.queryAll(By.css('a[target="_blank"]'));
      
      externalLinks.forEach(link => {
        expect(link.nativeElement.getAttribute('target')).toBe('_blank');
        expect(link.nativeElement.getAttribute('rel')).toBe('noopener');
      });
    });

    it('should have correct routerLink on internal FAQ link', () => {
      const faqLink = compiled.query(By.css('a[routerlink]'));
      expect(faqLink).toBeTruthy();
      expect(faqLink.nativeElement.getAttribute('routerlink')).toBe('/help/faq');
    });
  });

  describe('Contact Information Accuracy', () => {
    it('should display correct support email', () => {
      const emailValue = compiled.query(By.css('.item-row .value'));
      expect(emailValue.nativeElement.textContent).toContain('support@mytradingbox.app');
    });

    it('should display correct support hours', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const hoursValue = rows[1].query(By.css('.value'));
      expect(hoursValue.nativeElement.textContent).toContain('Mon–Fri');
      expect(hoursValue.nativeElement.textContent).toContain('09:00–18:00 CET');
    });

    it('should display all contact channels', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      const contactText = compiled.nativeElement.textContent;
      
      expect(contactText).toContain('Email');
      expect(contactText).toContain('Support Hours');
      expect(contactText).toContain('Status Page');
      expect(contactText).toContain('FAQ');
      expect(contactText).toContain('Community');
      expect(contactText).toContain('Security');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button element for back navigation', () => {
      const button = compiled.query(By.css('.wl-btn'));
      expect(button.nativeElement.tagName.toLowerCase()).toBe('button');
    });

    it('should have aria-label on back button', () => {
      const button = compiled.query(By.css('.wl-btn'));
      expect(button.nativeElement.hasAttribute('aria-label')).toBeTrue();
    });

    it('should have proper heading structure', () => {
      const headings = compiled.queryAll(By.css('h2, h3'));
      expect(headings.length).toBeGreaterThan(0);
    });

    it('should have h2 for main title', () => {
      const h2 = compiled.query(By.css('h2'));
      expect(h2).toBeTruthy();
      expect(h2.nativeElement.textContent).toContain('Contact');
    });

    it('should have h3 for section title', () => {
      const h3 = compiled.query(By.css('h3'));
      expect(h3).toBeTruthy();
      expect(h3.nativeElement.textContent).toContain('Get in touch');
    });
  });

  describe('Back Button Functionality', () => {
    it('should have back method', () => {
      expect(component.back).toBeDefined();
    });

    it('should call location.back on back method', () => {
      spyOn(location, 'back');
      
      component.back();
      
      expect(location.back).toHaveBeenCalled();
    });

    it('should navigate back when back button clicked', () => {
      spyOn(location, 'back');
      
      const backButton = compiled.query(By.css('.wl-btn'));
      backButton.nativeElement.click();
      fixture.detectChanges();
      
      expect(location.back).toHaveBeenCalled();
    });
  });

  describe('Contact Information Layout', () => {
    it('should structure contact info with proper item rows', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      
      rows.forEach(row => {
        const left = row.query(By.css('.item-left'));
        const right = row.query(By.css('.item-right'));
        
        expect(left).toBeTruthy();
        expect(right).toBeTruthy();
      });
    });

    it('should have consistent label-value structure', () => {
      const rows = compiled.queryAll(By.css('.item-row'));
      
      rows.forEach(row => {
        const label = row.query(By.css('.label'));
        const value = row.query(By.css('.value'));
        
        expect(label).toBeTruthy();
        expect(value).toBeTruthy();
      });
    });
  });

  describe('External Links Security', () => {
    it('should have noopener on all external links', () => {
      const externalLinks = compiled.queryAll(By.css('a[target="_blank"]'));
      
      externalLinks.forEach(link => {
        expect(link.nativeElement.getAttribute('rel')).toContain('noopener');
      });
    });

    it('should display security warning about API keys', () => {
      const securityText = compiled.nativeElement.textContent;
      expect(securityText).toContain('Never share API keys');
    });

    it('should display warning about seed phrases', () => {
      const securityText = compiled.nativeElement.textContent;
      expect(securityText).toContain('seed phrase');
    });
  });
});
