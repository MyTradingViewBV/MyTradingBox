export function onKeyEnterFocusNext(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;

  const currentElement = event.target as HTMLElement;
  const form = currentElement.closest('form') || document;

  const focusableSelectors = [
    'input:not([disabled])',
    'button:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])'
  ];

  const focusableElements = Array.from(form.querySelectorAll<HTMLElement>(focusableSelectors.join(','))).filter(
    el => el.offsetParent !== null
  );

  const currentIndex = focusableElements.indexOf(currentElement);
  const nextElement = focusableElements[currentIndex + 1];

  if (nextElement) {
    nextElement.focus();
    event.preventDefault();
  }
}
