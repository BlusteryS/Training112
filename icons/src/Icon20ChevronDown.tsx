import type { IconProps } from './types';

export function Icon20ChevronDown({ height = 20, width = 20, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={height}
      viewBox="0 0 20 20"
      width={width}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d="M7.0574 5.8074C7.30133 5.56347 7.69805 5.56376 7.94216 5.8074L12.3172 10.1824C12.5612 10.4265 12.5612 10.8231 12.3172 11.0672L7.94216 15.4422C7.69808 15.6862 7.30147 15.6862 7.0574 15.4422C6.81376 15.198 6.81347 14.8013 7.0574 14.5574L10.99 10.6248L7.0574 6.69216C6.81376 6.44805 6.81347 6.05133 7.0574 5.8074Z"
        fill="currentColor"
        transform="rotate(90 10 10)"
      />
    </svg>
  );
}
