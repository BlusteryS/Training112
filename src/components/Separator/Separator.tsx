import { forwardRef, type HTMLAttributes } from 'react';
import { classNames } from '../../utils/classNames';
import styles from './Separator.module.css';

export type SeparatorProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  paddingHorizontal?: boolean;
  paddingVertical?: boolean;
};

export const Separator = forwardRef<HTMLDivElement, SeparatorProps>(function Separator(
  {
    className,
    paddingHorizontal = false,
    paddingVertical = false,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      aria-orientation="horizontal"
      className={classNames(styles.separator, className)}
      data-padding-horizontal={paddingHorizontal}
      data-padding-vertical={paddingVertical}
      ref={ref}
      role="separator"
    />
  );
});
