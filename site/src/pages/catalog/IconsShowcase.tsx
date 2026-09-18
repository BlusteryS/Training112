import { useState, type ComponentType } from 'react';
import { Placeholder } from '@training112/components/Placeholder';
import { Search } from '@training112/components/Search';
import { useSnackbar } from '@training112/components/Snackbar';
import * as icons from '@training112/icons';
import type { IconProps } from '@training112/icons';
import showcaseStyles from './Showcase.module.css';
import styles from './IconsShowcase.module.css';

type IconEntry = {
  Icon: ComponentType<IconProps>;
  name: string;
  size: number;
};

const iconEntries: IconEntry[] = Object.entries(icons)
  .filter(([name, value]) => name.startsWith('Icon') && typeof value === 'function')
  .map(([name, Icon]) => ({
    Icon: Icon as ComponentType<IconProps>,
    name,
    size: Number(name.match(/^Icon(\d+)/)?.[1] ?? 0),
  }))
  .sort((first, second) => first.size - second.size || first.name.localeCompare(second.name));

const iconGroups = iconEntries.reduce<Array<{ icons: IconEntry[]; size: number }>>(
  (groups, icon) => {
    const currentGroup = groups.at(-1);

    if (currentGroup?.size === icon.size) {
      currentGroup.icons.push(icon);
    } else {
      groups.push({ icons: [icon], size: icon.size });
    }

    return groups;
  },
  [],
);

export default function IconsShowcase() {
  const [query, setQuery] = useState('');
  const snackbar = useSnackbar();
  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = iconGroups
    .map((group) => ({
      ...group,
      icons: group.icons.filter(({ name }) => name.toLowerCase().includes(normalizedQuery)),
    }))
    .filter(({ icons: groupIcons }) => groupIcons.length > 0);

  const copyIcon = async (name: string) => {
    const code = `<${name} />`;

    try {
      await navigator.clipboard.writeText(code);
      snackbar.open({ subtitle: code, title: 'Код скопирован' });
    } catch {
      snackbar.open({
        duration: 0,
        subtitle: code,
        title: 'Не удалось скопировать код',
      });
    }
  };

  return (
    <article className={showcaseStyles.showcase}>
      <header className={showcaseStyles.headerSection}>
        <h1 className={showcaseStyles.title}>Иконки</h1>
        <Search
          aria-label="Поиск иконок"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Поиск иконок"
          value={query}
          withClearButton
        />
      </header>

      <section aria-label="Доступные иконки" className={showcaseStyles.section}>
        {visibleGroups.length > 0 ? (
          <div className={styles.groups}>
            {visibleGroups.map(({ icons: groupIcons, size }) => (
              <section aria-labelledby={`icons-${size}`} className={styles.group} key={size}>
                <h2 className={styles.groupTitle} id={`icons-${size}`}>
                  {size}px
                </h2>
                <div className={styles.grid}>
                  {groupIcons.map(({ Icon, name }) => (
                    <button
                      aria-label={`Скопировать ${name}`}
                      className={styles.item}
                      key={name}
                      onClick={() => void copyIcon(name)}
                      type="button"
                    >
                      <span className={styles.preview}>
                        <Icon />
                      </span>
                      <code className={styles.name}>{name}</code>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <Placeholder
            subtitle="Попробуйте изменить запрос"
            title="Иконки не найдены"
          />
        )}
      </section>
    </article>
  );
}
