export const ddsStatusNames: Record<string, string> = {
  added: 'Добавлена',
  received: 'Получена',
  accepted: 'Принята',
  rejected: 'Не принята',
  dispatched: 'Начало реагирования',
  arrived: 'Прибытие',
  working: 'Проведение работ',
  completed: 'Работы завершены',
  refused: 'Отказ от выполнения работ',
};

export const ddsStatusOptions: Record<string, string[]> = {
  received: ['accepted', 'rejected'],
  rejected: ['accepted'],
  accepted: ['dispatched', 'refused'],
  dispatched: ['arrived', 'refused'],
  arrived: ['working', 'refused'],
  working: ['completed', 'refused'],
};

export const ddsPartyNames: Record<string, string> = {
  crew: 'старший бригады',
  caller: 'заявитель',
  supervisor: 'руководитель',
  service112: 'оператор 112',
};
