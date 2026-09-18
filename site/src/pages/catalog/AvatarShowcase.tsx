import { Avatar, type AvatarShape, type AvatarVariant } from '@training112/components/Avatar';
import type { DocumentationRow } from './ComponentDocumentation';
import { ComponentShowcase } from './ComponentShowcase';
import styles from './Showcase.module.css';

const avatarPhotoUrl =
  'https://sun7-1.vkuserphoto.ru/s/v1/ig2/YSLg2jKjeiB0JRw0XWtJnJcD7PUWc0p2wvqsKAPO5b5hYwiv4AAs78xitWPRclUNMa1uuxBWMxHNUKvH-nm5YJpt.jpg?quality=95&crop=201,0,768,768&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720&ava=1&u=9c4kQiSEsuXno57wId9y4Pavwk-FMIYBjjYmtufFpx4&cs=200x200';
const shapes: AvatarShape[] = ['circle', 'square'];
const variants: AvatarVariant[] = ['photo', 'color', 'placeholder'];
const documentation: DocumentationRow[] = [
  {
    name: 'variant',
    description: 'Тип содержимого',
    values: ['photo', 'color', 'placeholder'],
  },
  {
    name: 'shape',
    description: 'Форма аватара',
    values: ['circle', 'square'],
  },
  {
    name: 'size',
    description: 'Размер в пикселях',
    values: ['16', '24', '32', '44', '56', '72', '88'],
  },
  {
    name: 'src',
    description: 'URL фотографии',
    values: ['string'],
  },
  {
    name: 'alt',
    description: 'Альтернативный текст',
    values: ['string'],
  },
  {
    name: 'name',
    description: 'Имя для доступности и инициалов',
    values: ['string'],
  },
  {
    name: 'initials',
    description: 'Заданные инициалы',
    values: ['string'],
  },
];
const codeExample = `
<Avatar
  initials="С"
  name="Сергей"
  size={88}
  variant="color"
/>
`;

export default function AvatarShowcase() {
  return (
    <ComponentShowcase code={codeExample} documentation={documentation} name="Avatar">
      <div className={styles.avatarGrid}>
        {shapes.flatMap((shape) =>
          variants.map((variant) => {
            if (variant === 'photo') {
              return (
                <Avatar
                  alt="Сергей"
                  key={`${shape}-${variant}`}
                  shape={shape}
                  size={88}
                  src={avatarPhotoUrl}
                  variant={variant}
                />
              );
            }

            return (
              <Avatar
                initials="С"
                key={`${shape}-${variant}`}
                name="Сергей"
                shape={shape}
                size={88}
                variant={variant}
              />
            );
          }),
        )}
      </div>
    </ComponentShowcase>
  );
}
