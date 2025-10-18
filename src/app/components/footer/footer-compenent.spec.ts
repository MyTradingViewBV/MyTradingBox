import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterCompenent } from './footer-compenent';

describe('FooterCompenent', () => {
  let component: FooterCompenent;
  let fixture: ComponentFixture<FooterCompenent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterCompenent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FooterCompenent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
