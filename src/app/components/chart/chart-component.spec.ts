// Adjusted spec to test existing ChartComponent instead of missing ChartTestComponent
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChartComponent } from './chart-component';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('ChartComponent', () => {
  let component: ChartComponent;
  let fixture: ComponentFixture<ChartComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChartComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ChartComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
