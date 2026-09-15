import { ExternalLink } from 'lucide-react';
import { Avatar, avatarSizes, type AvatarShape } from '../components/Avatar';
import { Badge, type BadgeColor } from '../components/Badge';
import styles from './ComponentCatalogPage.module.css';

const avatarPhotoUrl =
  'https://sun7-1.vkuserphoto.ru/s/v1/ig2/YSLg2jKjeiB0JRw0XWtJnJcD7PUWc0p2wvqsKAPO5b5hYwiv4AAs78xitWPRclUNMa1uuxBWMxHNUKvH-nm5YJpt.jpg?quality=95&crop=201,0,768,768&as=32x32,48x48,72x72,108x108,160x160,240x240,360x360,480x480,540x540,640x640,720x720&ava=1&u=9c4kQiSEsuXno57wId9y4Pavwk-FMIYBjjYmtufFpx4&cs=200x200';
const demoIcon = <ExternalLink size={16} strokeWidth={1.5} />;
const shapes: AvatarShape[] = ['circle', 'square'];
const badgeVariants: Array<{ color: BadgeColor; label: string }> = [
  { color: 'white', label: 'Badge' },
  { color: 'blue', label: 'Brand' },
  { color: 'inverted', label: 'Inverted' },
  { color: 'success', label: 'Success' },
  { color: 'error', label: 'Error' },
  { color: 'warning', label: 'Warning' },
];

export function ComponentCatalogPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Components</p>
        <h1 className={styles.title}>Avatar</h1>
      </header>

      <section className={styles.specimen} aria-label="Варианты компонента Avatar">
        <div className={styles.canvas}>
          {shapes.map((shape) => (
            <div
              className={styles.shapeRow}
              data-shape={shape}
              key={shape}
              aria-label={shape === 'circle' ? 'Круглые аватары' : 'Квадратные аватары'}
            >
              {avatarSizes.map((size) => (
                <div className={styles.sizeGroup} key={size} aria-label={`Размер ${size}`}>
                  <Avatar
                    alt="Сергей"
                    shape={shape}
                    size={size}
                    src={avatarPhotoUrl}
                    variant="photo"
                  />
                  <Avatar initials="С" name="Сергей" shape={shape} size={size} variant="color" />
                  <Avatar
                    initials="С"
                    name="Сергей"
                    shape={shape}
                    size={size}
                    variant="placeholder"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className={styles.componentSection} aria-labelledby="badge-title">
        <h2 className={styles.componentTitle} id="badge-title">
          Badge
        </h2>

        <div className={`${styles.specimen} ${styles.badgeSpecimen}`}>
          <div className={styles.badgeCanvas}>
            {badgeVariants.map(({ color, label }, index) => (
              <Badge
                color={color}
                icon={demoIcon}
                key={`fill-${color}`}
                style={{ gridRow: index + 1 }}
              >
                {label}
              </Badge>
            ))}

            {badgeVariants.slice(1).map(({ color, label }, index) => (
              <Badge
                color={color as Exclude<BadgeColor, 'white'>}
                icon={demoIcon}
                key={`outline-${color}`}
                style={{ gridColumn: 2, gridRow: index + 2 }}
                variant="outline"
              >
                {label}
              </Badge>
            ))}
          </div>
        </div>
      </section>

    </main>
  );
}
