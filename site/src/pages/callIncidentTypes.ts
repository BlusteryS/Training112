export type IncidentType = {
  name: string;
  services: string[];
  questions: { field: 'incident_sign_2' | 'incident_sign_3'; label: string; options: string[] }[];
};

export const incidentTypes: IncidentType[] = [
  {
    name: 'Пожар или задымление', services: ['101'],
    questions: [
      { field: 'incident_sign_2', label: 'Что горит или дымит?', options: ['Квартира', 'Частный дом', 'Подъезд', 'Транспорт', 'Мусор', 'Трава', 'Лес', 'Другое'] },
      { field: 'incident_sign_3', label: 'Что наблюдает заявитель?', options: ['Открытое пламя', 'Дым', 'Запах гари', 'Неизвестно'] },
    ],
  },
  {
    name: 'Дорожно-транспортное происшествие', services: ['102'],
    questions: [
      { field: 'incident_sign_2', label: 'Участники ДТП', options: ['Легковые автомобили', 'Грузовой транспорт', 'Общественный транспорт', 'Пешеход', 'Другое'] },
      { field: 'incident_sign_3', label: 'Обстановка на месте', options: ['Есть пострадавшие', 'Заблокированы люди', 'Есть возгорание', 'Без пострадавших', 'Неизвестно'] },
    ],
  },
  {
    name: 'Требуется медицинская помощь', services: ['103'],
    questions: [
      { field: 'incident_sign_2', label: 'Состояние человека', options: ['В сознании', 'Без сознания', 'Неизвестно'] },
      { field: 'incident_sign_3', label: 'Характер обращения', options: ['Травма', 'Затруднено дыхание', 'Боль', 'Отравление', 'Другое'] },
    ],
  },
  {
    name: 'Нарушение общественного порядка', services: ['102'],
    questions: [
      { field: 'incident_sign_2', label: 'Что происходит?', options: ['Нападение', 'Угроза', 'Драка', 'Кража', 'Другое'] },
      { field: 'incident_sign_3', label: 'Есть непосредственная опасность?', options: ['Да', 'Нет', 'Неизвестно'] },
    ],
  },
  {
    name: 'Запах газа или авария газового оборудования', services: ['104'],
    questions: [
      { field: 'incident_sign_2', label: 'Место обнаружения', options: ['В квартире', 'В подъезде', 'На улице', 'В организации', 'Другое'] },
      { field: 'incident_sign_3', label: 'Что обнаружено?', options: ['Запах газа', 'Повреждение оборудования', 'Открытое пламя', 'Другое'] },
    ],
  },
  {
    name: 'Авария коммунальных сетей', services: ['ДДС района'],
    questions: [
      { field: 'incident_sign_2', label: 'Какая сеть повреждена?', options: ['Водоснабжение', 'Канализация', 'Отопление', 'Электроснабжение', 'Другое'] },
      { field: 'incident_sign_3', label: 'Что наблюдается?', options: ['Прорыв', 'Отключение', 'Затопление', 'Повреждение', 'Другое'] },
    ],
  },
];

export function recommendedServices(typeName: string, address: string, district: string, victims: string, sign: string) {
  if (!address.trim()) return [];
  const type = incidentTypes.find((item) => item.name === typeName);
  if (!type) return [];
  const services = type.services.map((service) => service === 'ДДС района' && district.trim()
    ? `ДДС района ${district.trim()}` : service);
  if (victims !== 'Нет' && !services.includes('103')) services.push('103');
  if (sign === 'Есть возгорание' && !services.includes('101')) services.push('101');
  return services;
}
