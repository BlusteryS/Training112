import { forwardRef, type HTMLAttributes } from 'react';
import { classNames } from '../utils/classNames';
import styles from './Progress.module.css';

export type ProgressProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  max?: number;
  value: number;
};

function normalizeMax(max: number) {
  return Number.isFinite(max) && max > 0 ? max : 100;
}

function clampValue(value: number, max: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), max);
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, max = 100, value, ...props },
  ref,
) {
  const normalizedMax = normalizeMax(max);
  const normalizedValue = clampValue(value, normalizedMax);
  const progress = (normalizedValue / normalizedMax) * 100;
  const classes = classNames(styles.root, className);

  return (
    <div
      {...props}
      aria-valuemax={normalizedMax}
      aria-valuemin={0}
      aria-valuenow={normalizedValue}
      className={classes}
      ref={ref}
      role="progressbar"
    >
      <div
        className={styles.fill}
        style={{ width: `${progress}%` }}
      />
    </div>
  );
});
