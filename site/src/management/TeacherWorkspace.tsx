import { useState } from 'react';
import { SectionTabs } from '../components/ui/SectionTabs';
import { Groups } from './Groups';
import { Lessons } from './Lessons';
import { Materials } from './Materials';
import { Reports } from './Reports';
import { Results } from './Results';
import { Scenarios } from './Scenarios';
import { ManagementPanel } from './Panel';

const sections = {
  lessons: 'Занятия',
  scenarios: 'Сценарии',
  groups: 'Группы',
  materials: 'Материалы',
  results: 'Результаты',
  reports: 'Отчёты',
} as const;

type Section = keyof typeof sections;

export function TeacherWorkspace() {
  const [section, setSection] = useState<Section>('lessons');
  return <ManagementPanel>
    <SectionTabs value={section} options={sections} onChange={setSection} />
    {section === 'lessons' && <Lessons />}
    {section === 'scenarios' && <Scenarios />}
    {section === 'groups' && <Groups />}
    {section === 'materials' && <Materials />}
    {section === 'results' && <Results />}
    {section === 'reports' && <Reports />}
  </ManagementPanel>;
}
