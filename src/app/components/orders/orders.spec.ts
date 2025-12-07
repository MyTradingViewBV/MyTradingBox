// Updated spec to use OrdersComponent actual class name
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersComponent } from './orders';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
class MockChartService {
  getTradeOrdersV2() { return of({ Orders: [] } as any); }
  getWatchlist() { return of([] as any); }
  deleteOrder() { return of(true as any); }
  getSymbols() { return of([{ SymbolName: 'BTCUSDT' }] as any); }
}

class MockSettingsService {
  dispatchAppAction() {}
}

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent, HttpClientTestingModule],
      providers: [
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
