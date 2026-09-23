import { useState } from 'react';
import { Groups } from './Groups';
import { Lessons } from './Lessons';
import { Scenarios } from './Scenarios';
import { ManagementPanel, PanelTitle } from './Panel';
import styles from './Panel.module.css';

export function TeacherWorkspace() {
  const [section, setSection] = useState('lessons');
  return <ManagementPanel>
    <PanelTitle>Кабинет преподавателя</PanelTitle>
    <p>Для первого занятия:</p>
    <div className={styles.steps}>
      <div><span>1</span>В разделе «Сценарии» опишите происшествие, сохраните и утвердите сценарий.</div>
      <div><span>2</span>В разделе «Группы» выберите обучающихся, которым будете назначать задания.</div>
      <div><span>3</span>В разделе «Занятия» создайте занятие и откройте приём звонков.</div>
    </div>
    <div className={styles.tabs}>
      {Object.entries({ lessons: 'Занятия', scenarios: 'Сценарии', groups: 'Группы' }).map(([id, title]) => <button key={id}
        aria-current={section === id ? 'page' : undefined} disabled={section === id} onClick={() => setSection(id)}>{title}</button>)}
    </div>
    <div hidden={section !== 'lessons'}>{section === 'lessons' && <Lessons />}</div>
    <div hidden={section !== 'scenarios'}><Scenarios /></div>
    <div hidden={section !== 'groups'}>{section === 'groups' && <Groups />}</div>
  </ManagementPanel>;
}
