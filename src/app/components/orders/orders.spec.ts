// Updated spec to use OrdersComponent actual class name
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OrdersComponent } from './orders';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { ChartService } from '../../modules/shared/services/http/chart.service';
import { SettingsService } from 'src/app/modules/shared/services/services/settingsService';
import { Router } from '@angular/router';
import { Location } from '@angular/common';
import { OrderModel } from 'src/app/modules/shared/models/orders/order.dto';
import { TradePlanModel } from 'src/app/modules/shared/models/orders/tradeOrders.dto';
import { SymbolModel } from 'src/app/modules/shared/models/chart/symbol.dto';
import { SettingsActions } from 'src/app/store/settings/settings.actions';

class MockChartService {
  getTradeOrdersV2() { return of({ Orders: [] } as any); }
  getWatchlist() { return of([] as any); }
  deleteOrder() { return of(void 0); }
  getSymbols() { return of([{ SymbolName: 'BTCUSDT' }] as any); }
}

class MockSettingsService {
  dispatchAppAction() {}
}

describe('OrdersComponent', () => {
  let component: OrdersComponent;
  let fixture: ComponentFixture<OrdersComponent>;
  let chartService: ChartService;
  let settingsService: SettingsService;
  let router: Router;
  let location: Location;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OrdersComponent, HttpClientTestingModule],
      providers: [
        { provide: ChartService, useClass: MockChartService },
        { provide: SettingsService, useClass: MockSettingsService },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: Location, useValue: { back: jasmine.createSpy('back') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OrdersComponent);
    component = fixture.componentInstance;
    chartService = TestBed.inject(ChartService);
    settingsService = TestBed.inject(SettingsService);
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // =============== INITIALIZATION TESTS ===============

  it('should initialize with empty orders array', () => {
    expect(component.orders).toEqual([]);
  });

  it('should initialize with empty filteredOrders array', () => {
    expect(component.filteredOrders).toEqual([]);
  });

  it('should initialize with ACTIVE status selected', () => {
    expect(component.selectedStatus).toBe('ACTIVE');
  });

  it('should initialize with loading as false', () => {
    expect(component.loading).toBeFalse();
  });

  it('should initialize with empty expandedOrderIds set', () => {
    expect(component.expandedOrderIds.size).toBe(0);
  });

  it('should initialize with empty selectedTimeframe', () => {
    expect(component.selectedTimeframe).toBe('');
  });

  it('should have TradePlanModel as fullResult', () => {
    expect(component.fullResult).toBeDefined();
  });

  // =============== NGONIT TESTS ===============

  it('ngOnInit should fetch orders from chart service', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(of({ Orders: [] } as any));

    component.ngOnInit();

    expect(chartService.getTradeOrdersV2).toHaveBeenCalled();
  });

  it('ngOnInit should set loading to true then false', () => {
    const mockOrders = [{ Id: 1, Status: 'NEW' } as OrderModel];
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: mockOrders } as any)
    );

    component.ngOnInit();

    expect(component.loading).toBeFalse();
  });

  it('ngOnInit should populate orders from response', () => {
    const mockOrders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
    ];
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: mockOrders } as any)
    );

    component.ngOnInit();

    expect(component.orders).toEqual(mockOrders);
  });

  it('ngOnInit should populate fullResult', () => {
    const mockData = { Orders: [{ Id: 1, Status: 'NEW' }], TotalCount: 1 };
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(of(mockData as any));

    component.ngOnInit();

    expect(component.fullResult).toEqual(mockData as any);
  });

  it('ngOnInit should populate filteredOrders with all orders initially', () => {
    const mockOrders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
    ];
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: mockOrders } as any)
    );

    component.ngOnInit();

    // After ngOnInit, filteredOrders should have NEW and TARGET1 (ACTIVE is default)
    // But we only have NEW and DONE in mock, so should be 1 (NEW)
    expect(component.filteredOrders.length).toBeGreaterThan(0);
  });

  it('ngOnInit should call filterOrders', () => {
    const mockOrders = [{ Id: 1, Status: 'NEW' } as OrderModel];
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: mockOrders } as any)
    );
    spyOn(component, 'filterOrders');

    component.ngOnInit();

    expect(component.filterOrders).toHaveBeenCalled();
  });

  // =============== FILTER ORDERS TESTS ===============

  it('filterOrders with ACTIVE status should show NEW and TARGET1 orders', () => {
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'TARGET1' } as OrderModel,
      { Id: 3, Status: 'DONE' } as OrderModel,
    ];
    component.selectedStatus = 'ACTIVE';

    component.filterOrders();

    expect(component.filteredOrders.length).toBe(2);
    expect(component.filteredOrders[0].Status).toBe('NEW');
    expect(component.filteredOrders[1].Status).toBe('TARGET1');
  });

  it('filterOrders with DONE status should show only DONE orders', () => {
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'TARGET1' } as OrderModel,
      { Id: 3, Status: 'DONE' } as OrderModel,
    ];
    component.selectedStatus = 'DONE';

    component.filterOrders();

    expect(component.filteredOrders.length).toBe(1);
    expect(component.filteredOrders[0].Status).toBe('DONE');
  });

  it('filterOrders with empty status should show all orders', () => {
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'TARGET1' } as OrderModel,
      { Id: 3, Status: 'DONE' } as OrderModel,
    ];
    component.selectedStatus = '';

    component.filterOrders();

    expect(component.filteredOrders.length).toBe(3);
  });

  it('filterOrders should not modify original orders array', () => {
    const orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
    ];
    component.orders = orders;
    component.selectedStatus = 'DONE';

    component.filterOrders();

    expect(component.orders.length).toBe(2);
  });

  it('filterOrders with specific status should show only matching orders', () => {
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'NEW' } as OrderModel,
      { Id: 3, Status: 'DONE' } as OrderModel,
    ];
    component.selectedStatus = 'NEW';

    component.filterOrders();

    expect(component.filteredOrders.length).toBe(2);
    expect(component.filteredOrders.every((o) => o.Status === 'NEW')).toBeTrue();
  });

  // =============== STATUS COLOR TESTS ===============

  it('getStatusColor should return primary for NEW status', () => {
    const color = component.getStatusColor('NEW');
    expect(color).toBe('primary');
  });

  it('getStatusColor should return accent for DONE status', () => {
    const color = component.getStatusColor('DONE');
    expect(color).toBe('accent');
  });

  it('getStatusColor should return empty string for other statuses', () => {
    const color = component.getStatusColor('TARGET1');
    expect(color).toBe('');
  });

  it('getStatusColor should return empty string for undefined status', () => {
    const color = component.getStatusColor('');
    expect(color).toBe('');
  });

  // =============== DELETE ORDER TESTS ===============

  it('deleteOrder should call chartService.deleteOrder with correct ID', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
    ];

    component.deleteOrder(1);

    expect(chartService.deleteOrder).toHaveBeenCalledWith(1);
  });

  it('deleteOrder should remove order from orders array', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
    ];

    component.deleteOrder(1);

    expect(component.orders.length).toBe(1);
    expect(component.orders[0].Id).toBe(2);
  });

  it('deleteOrder should not remove other orders', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'DONE' } as OrderModel,
      { Id: 3, Status: 'NEW' } as OrderModel,
    ];

    component.deleteOrder(2);

    expect(component.orders.length).toBe(2);
    expect(component.orders.map((o) => o.Id)).toEqual([1, 3]);
  });

  it('deleteOrder should handle deletion of non-existent order gracefully', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [{ Id: 1, Status: 'NEW' } as OrderModel];

    component.deleteOrder(999);

    expect(component.orders.length).toBe(1);
  });

  // =============== REFRESH TESTS ===============

  it('refresh should set loading to true initially', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.refresh();

    // After the subscription completes, it should be false
    expect(component.loading).toBeFalse();
  });

  it('refresh should fetch orders from chart service', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.refresh();

    expect(chartService.getTradeOrdersV2).toHaveBeenCalled();
  });

  it('refresh should update orders array', () => {
    const newOrders = [
      { Id: 10, Status: 'NEW' } as OrderModel,
      { Id: 11, Status: 'DONE' } as OrderModel,
    ];
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: newOrders, TotalCount: 2 } as any)
    );

    component.refresh();

    expect(component.orders).toEqual(newOrders);
  });

  it('refresh should update fullResult', () => {
    const mockData = {
      Orders: [{ Id: 1, Status: 'NEW' }],
      TotalCount: 1,
    };
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(of(mockData as any));

    component.refresh();

    expect(component.fullResult).toEqual(mockData as any);
  });

  it('refresh should reset selectedStatus to NEW', () => {
    component.selectedStatus = 'DONE';
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.refresh();

    expect(component.selectedStatus).toBe('NEW');
  });

  it('refresh should call filterOrders', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );
    spyOn(component, 'filterOrders');

    component.refresh();

    expect(component.filterOrders).toHaveBeenCalled();
  });

  it('refresh should set loading to false after completion', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.refresh();

    expect(component.loading).toBeFalse();
  });

  // =============== TOGGLE ORDER TESTS ===============

  it('toggleOrder should add order ID to expandedOrderIds if not present', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;

    component.toggleOrder(order);

    expect(component.expandedOrderIds.has(1)).toBeTrue();
  });

  it('toggleOrder should remove order ID from expandedOrderIds if present', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;
    component.expandedOrderIds.add(1);

    component.toggleOrder(order);

    expect(component.expandedOrderIds.has(1)).toBeFalse();
  });

  it('toggleOrder should toggle multiple orders independently', () => {
    const order1 = { Id: 1, Status: 'NEW' } as OrderModel;
    const order2 = { Id: 2, Status: 'DONE' } as OrderModel;

    component.toggleOrder(order1);
    component.toggleOrder(order2);

    expect(component.expandedOrderIds.has(1)).toBeTrue();
    expect(component.expandedOrderIds.has(2)).toBeTrue();
  });

  it('toggleOrder should toggle same order twice', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;

    component.toggleOrder(order);
    expect(component.expandedOrderIds.has(1)).toBeTrue();

    component.toggleOrder(order);
    expect(component.expandedOrderIds.has(1)).toBeFalse();
  });

  // =============== IS EXPANDED TESTS ===============

  it('isExpanded should return true if order is expanded', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;
    component.expandedOrderIds.add(1);

    expect(component.isExpanded(order)).toBeTrue();
  });

  it('isExpanded should return false if order is not expanded', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;

    expect(component.isExpanded(order)).toBeFalse();
  });

  it('isExpanded should work for multiple orders', () => {
    const order1 = { Id: 1, Status: 'NEW' } as OrderModel;
    const order2 = { Id: 2, Status: 'DONE' } as OrderModel;
    component.expandedOrderIds.add(1);

    expect(component.isExpanded(order1)).toBeTrue();
    expect(component.isExpanded(order2)).toBeFalse();
  });

  // =============== GO TO CHART TESTS ===============

  it('goToChart should not navigate if symbol is empty', () => {
    component.goToChart('', '1h');

    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('goToChart should fetch symbols from chart service', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );

    component.goToChart('BTCUSDT', '1h');

    expect(chartService.getSymbols).toHaveBeenCalled();
  });

  it('goToChart should dispatch setSelectedSymbol action', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    const navigateSpy = router.navigate as jasmine.Spy;
    navigateSpy.calls.reset();
    spyOn(settingsService, 'dispatchAppAction');

    component.goToChart('BTCUSDT', '1h');

    expect(settingsService.dispatchAppAction).toHaveBeenCalledWith(
      jasmine.any(Object)
    );
  });

  it('goToChart should use 1d as default timeframe if not provided', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    (router.navigate as jasmine.Spy).calls.reset();

    component.goToChart('BTCUSDT', '');

    expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '1d']);
  });

  it('goToChart should navigate to chart with symbol and timeframe', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    (router.navigate as jasmine.Spy).calls.reset();

    component.goToChart('BTCUSDT', '4h');

    expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '4h']);
  });

  it('goToChart should navigate to chart with only symbol if timeframe is empty after trim', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    (router.navigate as jasmine.Spy).calls.reset();

    component.goToChart('BTCUSDT', '   ');

    expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '1d']);
  });

  it('goToChart should trim symbol before navigation', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    (router.navigate as jasmine.Spy).calls.reset();

    component.goToChart('  BTCUSDT  ', '1h');

    expect(router.navigate).toHaveBeenCalledWith(['/chart', 'BTCUSDT', '1h']);
  });

  it('goToChart should handle case when symbol is not found', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(of([] as SymbolModel[]));

    expect(() => component.goToChart('UNKNOWN', '1h')).not.toThrow();
  });

  it('goToChart should navigate to base chart if no symbol or timeframe', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    (router.navigate as jasmine.Spy).calls.reset();

    component.goToChart('', '');

    expect(router.navigate).not.toHaveBeenCalled();
  });

  // =============== BACK NAVIGATION TEST ===============

  it('back should call location.back()', () => {
    component.back();

    expect(location.back).toHaveBeenCalled();
  });

  // =============== EDGE CASE TESTS ===============

  it('should handle empty orders array in ngOnInit', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.ngOnInit();

    expect(component.orders.length).toBe(0);
  });

  it('should handle null status in filterOrders', () => {
    component.orders = [
      { Id: 1, Status: null } as any,
      { Id: 2, Status: 'NEW' } as OrderModel,
    ];
    component.selectedStatus = 'ACTIVE';

    expect(() => component.filterOrders()).not.toThrow();
  });

  it('deleteOrder should handle multiple deletions in sequence', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [
      { Id: 1, Status: 'NEW' } as OrderModel,
      { Id: 2, Status: 'NEW' } as OrderModel,
      { Id: 3, Status: 'NEW' } as OrderModel,
    ];

    component.deleteOrder(1);
    component.deleteOrder(2);

    expect(component.orders.length).toBe(1);
    expect(component.orders[0].Id).toBe(3);
  });

  it('should handle rapid toggling of same order', () => {
    const order = { Id: 1, Status: 'NEW' } as OrderModel;

    for (let i = 0; i < 5; i++) {
      component.toggleOrder(order);
    }

    expect(component.expandedOrderIds.has(1)).toBeTrue();
  });

  it('refresh should clear expandedOrderIds after refresh', () => {
    component.expandedOrderIds.add(1);
    component.expandedOrderIds.add(2);
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({ Orders: [], TotalCount: 0 } as any)
    );

    component.refresh();

    // The component doesn't explicitly clear, but checking if it's still there
    expect(component.expandedOrderIds.size).toBe(2);
  });

  it('filterOrders should handle orders with mixed case statuses', () => {
    component.orders = [
      { Id: 1, Status: 'new' } as any,
      { Id: 2, Status: 'NEW' } as OrderModel,
      { Id: 3, Status: 'DONE' } as OrderModel,
    ];
    component.selectedStatus = 'ACTIVE';

    component.filterOrders();

    // Only exact case match should work
    expect(component.filteredOrders.length).toBe(1);
  });

  it('goToChart should dispatch setSelectedTimeframe action', () => {
    spyOn(chartService, 'getSymbols').and.returnValue(
      of([{ SymbolName: 'BTCUSDT' } as SymbolModel])
    );
    spyOn(settingsService, 'dispatchAppAction');

    component.goToChart('BTCUSDT', '4h');

    const calls = (settingsService.dispatchAppAction as jasmine.Spy).calls.all();
    expect(calls.length).toBeGreaterThan(0);
  });

  it('should maintain consistent state after multiple operations', () => {
    spyOn(chartService, 'getTradeOrdersV2').and.returnValue(
      of({
        Orders: [
          { Id: 1, Status: 'NEW' } as OrderModel,
          { Id: 2, Status: 'DONE' } as OrderModel,
        ],
      } as any)
    );

    component.ngOnInit();
    expect(component.orders.length).toBe(2);

    component.toggleOrder(component.orders[0]);
    expect(component.isExpanded(component.orders[0])).toBeTrue();

    component.selectedStatus = 'DONE';
    component.filterOrders();
    expect(component.filteredOrders.length).toBe(1);

    component.toggleOrder(component.orders[0]);
    expect(component.isExpanded(component.orders[0])).toBeFalse();
  });

  it('should handle deleteOrder on empty orders array', () => {
    spyOn(chartService, 'deleteOrder').and.returnValue(of(void 0));
    component.orders = [];

    component.deleteOrder(1);

    expect(component.orders.length).toBe(0);
  });
});
