import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './controls.module.css';

export function ActionButton({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return <button className={styles.action} type="button" {...props}>{children}</button>;
}

export function ActionRow({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
}
