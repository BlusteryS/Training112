import type { ClassifierCard } from '../../pages/incidentClassifier';

export type Question = { key: string; label: string; options?: string[]; multiple?: boolean };

const yesNo = ['Да', 'Нет', 'Неизвестно'];
const common: Question[] = [
  { key: 'people_threatened', label: 'Угроза людям', options: yesNo },
  { key: 'scene_access', label: 'Доступ к месту', options: ['Есть', 'Нет доступа', 'Неизвестно'] },
];
const fire: Question[] = [
  { key: 'fire_location', label: 'Где', options: ['Улица', 'Транспорт', 'Дом', 'Здание / объект', 'Опасный объект'] },
  { key: 'fire_sign', label: 'Признак пожара', options: ['Открытое пламя / дым', 'Запах гари', 'Сработала пожарная сигнализация'] },
  { key: 'traffic_restricted', label: 'Перекрыто движение', options: yesNo },
];
const fireBuilding: Question[] = [
  { key: 'building_type', label: 'Тип здания', options: ['Многоквартирный дом', 'Частный дом', 'Дача', 'Хозяйственная постройка', 'Выселенное здание'] },
  { key: 'building_storeys', label: 'Этажность здания' },
  { key: 'inside_objects', label: 'Внутридомовые объекты', multiple: true,
    options: ['Квартира', 'Балкон', 'Газовая колонка', 'Газовая плита', 'Лифт', 'Мусоропровод',
      'Подъезд', 'Счётчик электричества', 'Электрическая проводка', 'Электрощит',
      'Лестничная клетка', 'Подвал', 'Крыша', 'Другое'] },
  { key: 'gasified', label: 'Здание газифицировано', options: yesNo },
];
const gas: Question[] = [
  { key: 'gas_sign', label: 'Признаки происшествия', options: [
    'Запах газа на улице', 'Запах газа в помещении', 'Нарушение работы газового оборудования',
    'Повреждение газопровода', 'Повышенное давление газа'] },
];
const explosion: Question[] = [
  { key: 'explosion_location', label: 'Где взрыв', options: ['Здание / объект', 'Транспорт', 'Неизвестно'] },
  { key: 'fire_after_explosion', label: 'Есть возгорание', options: yesNo },
  { key: 'collapse_risk', label: 'Угроза обрушения', options: yesNo },
  { key: 'visible_damage', label: 'Видимые разрушения' },
];
const road: Question[] = [
  { key: 'vehicles', label: 'Участники происшествия' },
  { key: 'traffic_restricted', label: 'Перекрыто движение', options: yesNo },
  { key: 'fuel_spill', label: 'Разлив топлива', options: yesNo },
];
const medical: Question[] = [
  { key: 'consciousness', label: 'Сознание пострадавшего', options: ['В сознании', 'Без сознания', 'Неизвестно'] },
  { key: 'breathing', label: 'Дыхание пострадавшего', options: ['Есть', 'Нет', 'Неизвестно'] },
  { key: 'injury', label: 'Травмы и жалобы' },
];

export function questionsFor(card: ClassifierCard): Question[] {
  const incident = `${card.result} ${card.type}`.toLocaleLowerCase('ru');
  if (incident.includes('взрыв')) return [...common, ...explosion];
  if (card.services.includes('104') && incident.includes('газ')) return [...common, ...gas];
  if (/пожар|возгоран|задымлен|дым|гари/.test(incident))
    return [...common, ...fire, ...(/дом|квартир|здани|объект|подъезд/.test(incident + card.sign2)
      ? fireBuilding : [])];
  if (/дтп|дорожн|столкновен|наезд/.test(incident)) return [...common, ...road];
  if (card.services.includes('103')) return [...common, ...medical];
  return common;
}


const labels = new Map([...common, ...fire, ...fireBuilding, ...gas, ...explosion, ...road, ...medical]
  .map((question) => [question.key, question.label]));

export function questionLabel(key: string) {
  return labels.get(key) ?? key;
}
