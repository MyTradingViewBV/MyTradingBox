import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrdersComponent } from './orders';
import { ChartService } from 'src/app/modules/shared/services/http/chart.service';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { TradePlanModel } from 'src/app/modules/shared/models/orders/tradeOrders.dto';
import {
  installMatchMediaStub,
  provideComponentTestEnvironment,
} from 'src/testing/test-providers';

function order(id: number, status: string): OrderModel {
  return Object.assign(new OrderModel(), {
    Id: id,
    Symbol: `SYM${id}USDT`,
    Status: status,
    CreatedAt: '2026-01-01T00:00:00Z',
  });
}

describe('OrdersComponent', () => {
  let fixture: ComponentFixture<OrdersComponent>;
  let component: OrdersComponent;
  let chartService: {
    getTradeOrdersV2: ReturnType<typeof vi.fn>;
    deleteOrder: ReturnType<typeof vi.fn>;
    getSymbols: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    installMatchMediaStub();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const plan = Object.assign(new TradePlanModel(), {
      Orders: [order(1, 'NEW'), order(2, 'TARGET1'), order(3, 'DONE')],
    });
    chartService = {
      getTradeOrdersV2: vi.fn().mockReturnValue(of(plan)),
      deleteOrder: vi.fn().mockReturnValue(of(undefined)),
      getSymbols: vi.fn().mockReturnValue(of([])),
    };

    await TestBed.configureTestingModule({
      imports: [OrdersComponent],
      providers: [
        provideComponentTestEnvironment(),
        { provide: ChartService, useValue: chartService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => vi.restoreAllMocks());

  it('creates and loads orders, showing only active ones by default', () => {
    expect(component).toBeTruthy();
    expect(chartService.getTradeOrdersV2).toHaveBeenCalledTimes(1);
    expect(component.loading).toBe(false);
    expect(component.filteredOrders.map((o) => o.Id)).toEqual([1, 2]);
  });

  it('filters by an explicit status and shows everything when cleared', () => {
    component.selectedStatus = 'DONE';
    component.filterOrders();
    expect(component.filteredOrders.map((o) => o.Id)).toEqual([3]);

    component.selectedStatus = '';
    component.filterOrders();
    expect(component.filteredOrders.map((o) => o.Id)).toEqual([1, 2, 3]);
  });

  it('does nothing when the delete confirmation is cancelled', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    component.deleteOrder(1);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(chartService.deleteOrder).not.toHaveBeenCalled();
    expect(component.orders.map((o) => o.Id)).toEqual([1, 2, 3]);
  });

  it('expands and collapses an order card in the rendered view', () => {
    const card = (): HTMLElement =>
      fixture.nativeElement.querySelectorAll('.ord-expansion')[0] as HTMLElement;
    expect(card().classList.contains('open')).toBe(false);

    (card().querySelector('.ord-expansion-header') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(card().classList.contains('open')).toBe(true);
    expect(card().querySelector('.ord-expansion-body')).not.toBeNull();

    (card().querySelector('.ord-expansion-header') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(card().classList.contains('open')).toBe(false);
    expect(card().querySelector('.ord-expansion-body')).toBeNull();
  });

  it('deletes the order and removes it from the list once confirmed', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.deleteOrder(1);

    expect(chartService.deleteOrder).toHaveBeenCalledWith(1);
    expect(component.orders.map((o) => o.Id)).toEqual([2, 3]);
    expect(component.filteredOrders.map((o) => o.Id)).toEqual([2]);
  });
});
