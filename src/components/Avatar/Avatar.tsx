import type { CSSProperties, HTMLAttributes } from 'react';
import styles from './Avatar.module.css';

export const avatarSizes = [16, 24, 32, 44, 56, 72, 88] as const;

export type AvatarSize = (typeof avatarSizes)[number];
export type AvatarShape = 'circle' | 'square';
export type AvatarVariant = 'photo' | 'color' | 'placeholder';

type AvatarBaseProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  /** Size of the avatar in CSS pixels. */
  size?: AvatarSize;
  /** Circular avatars are used for people; square avatars can represent entities. */
  shape?: AvatarShape;
};

type PhotoAvatarProps = AvatarBaseProps & {
  variant: 'photo';
  src: string;
  alt?: string;
  name?: never;
  initials?: never;
};

type TextAvatarProps = AvatarBaseProps & {
  variant: Exclude<AvatarVariant, 'photo'>;
  /** Full accessible name. It is also used to derive initials when needed. */
  name: string;
  initials?: string;
  src?: never;
  alt?: never;
};

export type AvatarProps = PhotoAvatarProps | TextAvatarProps;

type AvatarStyle = CSSProperties & {
  '--avatar-size': string;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);

  if (words.length === 0) {
    return '?';
  }

  const relevantWords = words.length > 1 ? [words[0], words.at(-1)] : words;

  return relevantWords
    .map((word) => Array.from(word ?? '')[0] ?? '')
    .join('')
    .toLocaleUpperCase();
}

export function Avatar({
  size = 44,
  shape = 'circle',
  variant,
  className,
  style,
  ...props
}: AvatarProps) {
  const classes = [styles.avatar, className].filter(Boolean).join(' ');
  const avatarStyle: AvatarStyle = {
    ...style,
    '--avatar-size': `${size}px`,
  };

  if (variant === 'photo') {
    const { src, alt = '', ...rootProps } = props as Omit<PhotoAvatarProps, keyof AvatarBaseProps>;

    return (
      <span
        {...rootProps}
        className={classes}
        data-shape={shape}
        data-size={size}
        data-variant={variant}
        style={avatarStyle}
      >
        <img className={styles.image} src={src} alt={alt} width={size} height={size} />
      </span>
    );
  }

  const { name, initials, ...rootProps } = props as Omit<TextAvatarProps, keyof AvatarBaseProps>;

  return (
    <span
      {...rootProps}
      aria-label={name}
      className={classes}
      data-shape={shape}
      data-size={size}
      data-variant={variant}
      role="img"
      style={avatarStyle}
    >
      <span aria-hidden="true" className={styles.initials}>
        {initials?.trim() || getInitials(name)}
      </span>
    </span>
  );
}
