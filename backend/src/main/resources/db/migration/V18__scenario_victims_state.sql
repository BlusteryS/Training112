UPDATE scenario
SET document = jsonb_set(
    document,
    '{facts,victims_state}',
    to_jsonb(CASE
      WHEN document #>> '{facts,victims}' IN (
        'Да, есть пострадавшие.',
        'Есть люди, которым нужна помощь.',
        'Да, люди пострадали.'
      ) THEN 'present'
      WHEN document #>> '{facts,victims}' IN (
        'Пострадавших нет.',
        'Нет, никто не пострадал.',
        'Я не вижу пострадавших.'
      ) THEN 'absent'
      ELSE 'unknown'
    END),
    true
  )
WHERE document #>> '{facts,victims_state}' IS NULL
  AND document -> 'facts' IS NOT NULL;
