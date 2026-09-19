export function clearInput(input: HTMLInputElement) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value',
  )?.set;

  if (valueSetter) {
    valueSetter.call(input, '');
  } else {
    input.value = '';
  }

  input.dispatchEvent(new InputEvent('input', { bubbles: true }));
}
