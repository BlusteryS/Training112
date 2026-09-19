import type { IconProps } from './types';

export function Icon24More({ height = 24, width = 24, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={height}
      viewBox="0 0 24 24"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M6 10.5C6.82843 10.5 7.5 11.1715 7.5 12C7.5 12.8284 6.82843 13.5 6 13.5C5.17157 13.5 4.5 12.8284 4.5 12C4.5 11.1715 5.17157 10.5 6 10.5ZM12 10.5C12.8284 10.5 13.5 11.1715 13.5 12C13.5 12.8284 12.8284 13.5 12 13.5C11.1716 13.5 10.5 12.8284 10.5 12C10.5 11.1715 11.1716 10.5 12 10.5ZM18 10.5C18.8284 10.5 19.5 11.1715 19.5 12C19.5 12.8284 18.8284 13.5 18 13.5C17.1716 13.5 16.5 12.8284 16.5 12C16.5 11.1715 17.1716 10.5 18 10.5Z" fill="currentColor" />
    </svg>
  );
}
