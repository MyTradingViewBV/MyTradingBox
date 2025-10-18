// Updated spec to use OrdersComponent actual class name
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersComponent } from './orders';
import { HttpClientTestingModule } from '@angular/common/http/testing';

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
