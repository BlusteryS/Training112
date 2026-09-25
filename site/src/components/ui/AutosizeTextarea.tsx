import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'>;

function fit(element: HTMLTextAreaElement) {
  element.style.height = '34px';
  element.style.height = `${Math.max(34, element.scrollHeight)}px`;
}

export function AutosizeTextarea({ value, onInput, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (ref.current) fit(ref.current);
  }, [value]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth;
        fit(element);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <textarea {...props} ref={ref} rows={1} value={value}
    onInput={(event) => { fit(event.currentTarget); onInput?.(event); }} />;
}
