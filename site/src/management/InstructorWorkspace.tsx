import { Navigate, useParams } from 'react-router-dom';
import { SectionTabs } from '../components/ui/SectionTabs';
import { Groups } from './Groups';
import { Lessons } from './Lessons';
import { Materials } from './Materials';
import { Reports } from './Reports';
import { Results } from './Results';
import { Scenarios } from './Scenarios';

const sections = {
  lessons: 'Занятия',
  scenarios: 'Сценарии',
  groups: 'Группы',
  materials: 'Материалы',
  results: 'Результаты',
  reports: 'Отчёты',
} as const;

const pages = { lessons: Lessons, scenarios: Scenarios, groups: Groups,
  materials: Materials, results: Results, reports: Reports };

export function InstructorWorkspace() {
  const { section } = useParams();
  if (!section || !Object.hasOwn(pages, section)) return <Navigate replace to="/instructor/lessons" />;
  const Page = pages[section as keyof typeof pages];
  return <div data-tab-workspace>
    <SectionTabs options={sections} basePath="/instructor" />
    <Page />
  </div>;
}
