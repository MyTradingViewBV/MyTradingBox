import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ContactComponent } from './contact.component';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

describe('ContactComponent', () => {
  let fixture: ComponentFixture<ContactComponent>;

  beforeEach(async () => {
    installMatchMediaStub();
    await TestBed.configureTestingModule({
      imports: [ContactComponent],
      providers: [provideComponentTestEnvironment()],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactComponent);
    fixture.detectChanges();
  });

  it('creates and renders the page title and footer', () => {
    expect(fixture.componentInstance).toBeTruthy();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.page-title')?.textContent).toContain(
      'CONTACT.TITLE',
    );
    expect(el.querySelector('app-footer')).not.toBeNull();
  });

  it('opens every external link in a new tab without leaking the opener', () => {
    const external = Array.from(
      (
        fixture.nativeElement as HTMLElement
      ).querySelectorAll<HTMLAnchorElement>('a[href^="http"]'),
    );
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.target).toBe('_blank');
      expect(link.rel).toContain('noopener');
    }
  });

  it('links the FAQ through the router', () => {
    const faq = (
      fixture.nativeElement as HTMLElement
    ).querySelector<HTMLAnchorElement>('a[href="/help/faq"]');
    expect(faq).not.toBeNull();
  });
});
