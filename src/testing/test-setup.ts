/**
 * Global Vitest setup (angular.json -> test.options.setupFiles).
 * Runs in every test file after the Angular TestBed has been initialised.
 *
 * The unit-test builder runs files with `isolate: false`, so globals are shared
 * by all spec files in a worker: anything a spec leaks (fake timers, spies,
 * a mutated `Date`) breaks unrelated specs that happen to run later.
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, expect, vi } from 'vitest';

// jsdom has no canvas implementation and logs "Not implemented:
// HTMLCanvasElement's getContext()" for every call. Return null (which is what
// jsdom returns as well) without the console noise; chart code already handles
// a missing 2D context.
if (typeof HTMLCanvasElement !== 'undefined') {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: function getContext(): null {
      return null;
    },
  });
}

let reportedFrozenDate = false;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();

  // Regression guard for a cross-file flake: a Date created while
  // vi.useFakeTimers() is active carries an own `constructor` property that
  // points at the global Date. When such a Date ends up in NgRx state or an
  // action, NgRx's immutability runtime check deep-freezes it -- and with it the
  // global Date constructor. Every later vi.useFakeTimers() in the same worker
  // then throws "Cannot assign to read only property 'now' of ClockDate".
  // Fail the offending test instead of an unrelated one further down the run.
  if (!reportedFrozenDate && Object.isFrozen(Date)) {
    reportedFrozenDate = true;
    TestBed.resetTestingModule();
    throw new Error(
      `The global Date constructor was frozen during "${expect.getState().currentTestName}". ` +
        'A Date created under vi.useFakeTimers() was probably dispatched to the NgRx store. ' +
        "Use vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', ...] }) (leave Date real) " +
        "or pin the clock with vi.spyOn(Date, 'now') in that spec.",
    );
  }
});
