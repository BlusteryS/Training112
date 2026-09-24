export type Learner = { id: string; login: string; blocked?: boolean };
export type Group = { id: string; name: string; service_code: string; member_count: number };
export type Scenario = { id: string; title: string; status: string };
export type Lesson = { id: string; group_name: string; title: string; status: string; mode: string };
export type Assignment = {
  id: string; lesson_id: string; learner_id: string; learner_login: string;
  title: string; group_name: string; mode: string; status: string;
  instructions: string | null; difficulty: string | null;
  attempt_id: string | null; attempt_status: string | null;
  created_at: string | null;
  workstation: string | null;
  incident_source: string | null;
  vis_operator: string | null;
  caller_phone: string | null;
  service: string | null;
  origin: string | null;
  facts: Record<string, string> | null;
  card_deadline_seconds: number | null;
  card: Record<string, string> | null;
};
export type ScenarioDocument = {
  schema_version: number; title: string; voice_id: string; origin: string;
  difficulty?: string; instructions?: string;
  facts: Record<string, string>;
  initial_state: string; states: string[];
  intents: { id: string; examples: string[] }[];
  responses: { id: string; intent: string; states: string[]; variants: string[]; next_state?: string; end_call?: boolean }[];
  greeting: string[]; clarification: string[]; check_in: string[]; contact?: string[];
  rubric: { id: string; kind: string; weight: number; description: string; field?: string; expected?: string; action?: string; seconds?: number; source?: string }[];
  acceptance_cases: { text: string; state: string; response_id?: string; response_ids?: string[] }[];
};
export const scenarioNames: Record<string, string> = {
  draft: 'Черновик', preparing: 'Проверка диалога и запись голоса',
  prepared: 'Готов к утверждению', approved: 'Утверждён', failed: 'Не удалось подготовить',
};
export const lessonNames: Record<string, string> = { planned: 'Ожидает запуска', active: 'Идёт занятие', completed: 'Завершено' };
export const attemptNames: Record<string, string> = {
  created: 'Подключается', active: 'Выполняет задание', suspended: 'Восстанавливает связь',
  completed: 'Закончил', failed: 'Звонок прерван',
};
export const difficultyNames: Record<string, string> = { basic: 'Базовый', intermediate: 'Средний', advanced: 'Сложный' };
