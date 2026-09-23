import { useState } from 'react';
import { Groups } from './Groups';
import { Lessons } from './Lessons';
import { Scenarios } from './Scenarios';

export function TeacherWorkspace() {
  const [section, setSection] = useState('lessons');
  return <>
    <h2>Кабинет преподавателя</h2>
    <p>Для первого занятия:</p>
    <ol>
      <li>В разделе «Сценарии» опишите происшествие, сохраните и утвердите сценарий.</li>
      <li>В разделе «Группы» выберите обучающихся, которым будете назначать задания.</li>
      <li>В разделе «Занятия» создайте занятие и откройте приём звонков.</li>
    </ol>
    <nav aria-label="Разделы преподавателя">
      {Object.entries({ lessons: 'Занятия', scenarios: 'Сценарии', groups: 'Группы' }).map(([id, title]) => <button key={id}
        aria-current={section === id ? 'page' : undefined} disabled={section === id} onClick={() => setSection(id)}>{title}</button>)}
    </nav>
    <div hidden={section !== 'lessons'}>{section === 'lessons' && <Lessons />}</div>
    <div hidden={section !== 'scenarios'}><Scenarios /></div>
    <div hidden={section !== 'groups'}>{section === 'groups' && <Groups />}</div>
  </>;
}
