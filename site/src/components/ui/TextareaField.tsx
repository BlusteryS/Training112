import type { TextareaHTMLAttributes } from 'react';
import { AutosizeTextarea } from './AutosizeTextarea';
import { FieldLayout, type FieldTone } from './FieldLayout';
import styles from './TextareaField.module.css';

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> & {
  label: string;
  wide?: boolean;
  tone?: FieldTone;
};

export function TextareaField({ label, wide, tone, ...props }: Props) {
  return <FieldLayout label={label} wide={wide} tone={tone}>
    <AutosizeTextarea {...props} className={tone === 'search' ? styles.search : styles.textarea} />
  </FieldLayout>;
}
