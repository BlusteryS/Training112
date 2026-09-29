import type { SurveySelection } from '../components/call/IncidentSurvey';

export type IncidentDraft = {
  phone: string;
  provided_phone: string;
  scene_phone: string;
  communication_channel: string;
  foreign_phone: string;
  caller_name: string;
  caller_status: string;
  birth_date: string;
  residence: string;
  foreign_language: string;
  incident_code: string;
  classifier_code: string;
  incident_types: string;
  incident_sign_2: string;
  incident_sign_3: string;
  incident_details: string;
  survey_answers: string;
  address: string;
  address_description: string;
  location_lat: string;
  location_lon: string;
  country: string;
  city: string;
  okrug: string;
  district: string;
  object: string;
  street: string;
  house: string;
  building: string;
  structure: string;
  apartment: string;
  entry_code: string;
  entrance: string;
  floor: string;
  description: string;
  victims: string;
  medical_help: string;
  blocked_people: string;
  law_violation: string;
  services: string;
  comment: string;
};

export function initialDraft(phone: string, card?: Record<string, string> | null): IncidentDraft {
  const draft: IncidentDraft = {
    phone, provided_phone: '', scene_phone: '', communication_channel: 'Мобильный телефон',
    foreign_phone: 'false', caller_name: '', caller_status: '', birth_date: '', residence: '',
    foreign_language: 'false',
    incident_code: '', classifier_code: '', incident_types: '[]',
    incident_sign_2: '', incident_sign_3: '', incident_details: '', survey_answers: '{}',
    address: '', address_description: '', location_lat: '', location_lon: '',
    country: 'Россия', city: 'Москва', okrug: '',
    district: '', object: '', street: '', house: '', building: '', structure: '', apartment: '',
    entry_code: '', entrance: '', floor: '', description: '', victims: 'Неизвестно',
    medical_help: 'Неизвестно', blocked_people: 'Неизвестно',
    law_violation: 'false', services: '', comment: '',
  };
  if (card) {
    for (const key of Object.keys(draft) as (keyof IncidentDraft)[]) {
      if (typeof card[key] === 'string') draft[key] = card[key];
    }
  }
  return draft;
}

export function splitServices(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function surveyAnswers(value: string): Record<string, Record<string, string>> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed as Record<string, Record<string, string>>;
  } catch { /* Карточка ещё не содержит ответов на уточнения. */ }
  return {};
}

export function additionalIncidents(card?: Record<string, string> | null): SurveySelection[] {
  try {
    const values: unknown = JSON.parse(card?.incident_types ?? '[]');
    if (!Array.isArray(values)) return [];
    return values.slice(1).filter((item): item is SurveySelection => item !== null
      && typeof item === 'object' && typeof item.type === 'string'
      && typeof item.sign2 === 'string' && typeof item.sign3 === 'string')
      .map((item) => ({ type: item.type, sign2: item.sign2, sign3: item.sign3,
        code: typeof item.code === 'string' ? item.code : '' }));
  } catch {
    return [];
  }
}

export function elapsedParts(seconds: number) {
  return {
    minutes: Math.floor(seconds / 60).toString().padStart(2, '0'),
    seconds: (seconds % 60).toString().padStart(2, '0'),
  };
}
