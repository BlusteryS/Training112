import type { IconProps } from './types';

export type Icon20TooltipArrowProps = IconProps & {
  orientation?: 'horizontal' | 'vertical';
};

export function Icon20TooltipArrow({
  height,
  orientation = 'horizontal',
  width,
  ...props
}: Icon20TooltipArrowProps) {
  const isVertical = orientation === 'vertical';

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={height ?? (isVertical ? 20 : 8)}
      viewBox={isVertical ? '0 0 8 20' : '0 0 20 8'}
      width={width ?? (isVertical ? 8 : 20)}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        d={
          isVertical
            ? 'M0 10C0 7 8 4.0001 8 0V20C8 16.0251 0 13 0 10Z'
            : 'M10 0C13 0 15.9999 8 20 8H0C3.9749 8 7 0 10 0Z'
        }
        fill="currentColor"
      />
    </svg>
  );
}
