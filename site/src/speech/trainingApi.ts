import { api } from '../api';
import type { Assignment } from '../management/types';

export type AssignedAttempt = {
  id: string;
  phone: string;
  card: Record<string, string> | null;
  deadlineSeconds: number | null;
  startedAt: number | null;
};

type AttemptState = {
  id: string;
  event_sequence: number;
  card: Record<string, string> | null;
};

export async function startAssignedAttempt(learnerId: string, assignmentId: string): Promise<AssignedAttempt> {
  if (!assignmentId) throw new Error('Входящий звонок не найден. Вернитесь к списку происшествий.');
  const assignments = await api<Assignment[]>('training/assignments');
  const assignment = assignments.find((item) => item.id === assignmentId && item.learner_id === learnerId
    && item.mode === 'call' && item.status === 'active');
  if (!assignment) throw new Error('Задание недоступно. Возможно, преподаватель уже завершил занятие.');
  if (assignment.attempt_id && assignment.attempt_status && ['created', 'active', 'suspended'].includes(assignment.attempt_status)) {
    const startedAt = assignment.attempt_started_at ? Date.parse(assignment.attempt_started_at) : null;
    return { id: assignment.attempt_id, phone: assignment.caller_phone?.trim() ?? '',
      card: assignment.card, deadlineSeconds: assignment.card_deadline_seconds,
      startedAt: startedAt !== null && Number.isFinite(startedAt) ? startedAt : null };
  }
  const attempt = await api<AttemptState>('training/attempts', {
    id: crypto.randomUUID(), assignment_id: assignment.id,
  });
  return { id: attempt.id, phone: assignment.caller_phone?.trim() ?? '',
    card: attempt.card, deadlineSeconds: assignment.card_deadline_seconds, startedAt: null };
}

export async function saveAttemptCard(id: string, card: Record<string, string>) {
  const attempt = await api<AttemptState>(`training/attempts/${id}`);
  await api(`training/attempts/${id}/commands`, {
    event_id: crypto.randomUUID(),
    expected_sequence: attempt.event_sequence,
    type: 'card.update',
    payload: card,
  });
}

export function finishAttempt(id: string, failed = false) {
  return api<void>(`training/attempts/${id}/finish`, { failed });
}

export type DdsCard = Record<string, string | undefined> & {
  phone: string; services: string; dds_service: string;
  incident_types: string; survey_answers: string;
};

export type CardAttempt = Omit<AttemptState, 'card'> & {
  card: DdsCard;
  card_status: string; started_at: string | null; status: string; dds_crew: string | null;
};

export async function openCardAttempt(learnerId: string, assignmentId: string) {
  const assignments = await api<Assignment[]>('training/assignments');
  const assignment = assignments.find((item) => item.id === assignmentId && item.learner_id === learnerId
    && item.mode === 'card' && item.status === 'active');
  if (!assignment) throw new Error('Карточка недоступна. Возможно, преподаватель уже завершил занятие.');
  if (assignment.attempt_id && assignment.attempt_status && ['created', 'active', 'suspended'].includes(assignment.attempt_status)) {
    const attempt = await api<CardAttempt>(`training/attempts/${assignment.attempt_id}`);
    return { assignment, attempt };
  }
  throw new Error('Карточка уже обработана. Дождитесь следующей карточки или обновите список происшествий.');
}

export type AttemptEvent = {
  type: string;
  created_at: string;
  actor_id?: string | null;
  source?: string;
  payload: { status?: string; comment?: string; crew?: string; party?: string;
    direction?: string; topic?: string; report_status?: string; message?: string; audio?: string };
};

export type DdsServiceStatus = {
  service: string;
  status: string;
  started_at: string | null;
  history: { status: string; comment: string; created_at: string }[];
};

export async function attemptEvents(id: string) {
  return api<AttemptEvent[]>(`training/attempts/${id}/events?after=0`);
}

export async function postCardStatus(id: string, status: string, comment: string) {
  await postDdsCommand(id, 'card.status', { status, comment });
  return api<CardAttempt>(`training/attempts/${id}`);
}

async function postDdsCommand(id: string, type: string, payload: Record<string, string>) {
  const attempt = await api<CardAttempt>(`training/attempts/${id}`);
  return api<AttemptEvent>(`training/attempts/${id}/commands`, {
    event_id: crypto.randomUUID(),
    expected_sequence: attempt.event_sequence,
    type,
    payload,
  });
}

export function selectDdsCrew(id: string, crew: string) {
  return postDdsCommand(id, 'dds.crew.select', { crew });
}

export type PhoneReport = { party: string; direction: string; topic?: string;
  report_status?: string; audio: string; message: string };

export type DdsPhoneParty = 'crew' | 'caller' | 'supervisor' | 'service112';

export function recognizeDdsPhone(id: string, pcm16: string) {
  return api<{ text: string }>(`training/attempts/${id}/phone/recognize`, { pcm16 });
}

export function previewDdsPhone(id: string, party: DdsPhoneParty, direction: 'incoming' | 'outgoing',
  utterance: string, topic?: string) {
  return api<PhoneReport>(`training/attempts/${id}/phone`, { party, direction, utterance,
    ...(topic ? { topic } : {}) });
}

export function recordDdsPhone(id: string, party: DdsPhoneParty, direction: 'incoming' | 'outgoing',
  utterance: string, topic?: string) {
  return postDdsCommand(id, 'dds.phone.report', { party, direction, utterance,
    ...(topic ? { topic } : {}) });
}
