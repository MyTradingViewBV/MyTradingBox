// Fixed naming to FooterComponent
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FooterComponent } from './footer-compenent';
import { SwUpdate } from '@angular/service-worker';

class MockSwUpdate {} // minimal stub

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
      providers: [
        { provide: SwUpdate, useClass: MockSwUpdate },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
