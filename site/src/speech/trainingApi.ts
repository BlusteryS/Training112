import { api } from '../api';
import type { Assignment } from '../management/types';

export type AssignedAttempt = {
  id: string;
  phone: string;
  card: Record<string, string> | null;
  deadlineSeconds: number | null;
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
    return { id: assignment.attempt_id, phone: assignment.caller_phone?.trim() ?? '',
      card: assignment.card, deadlineSeconds: assignment.card_deadline_seconds };
  }
  const attempt = await api<AttemptState>('training/attempts', {
    id: crypto.randomUUID(), assignment_id: assignment.id,
  });
  return { id: attempt.id, phone: assignment.caller_phone?.trim() ?? '',
    card: attempt.card, deadlineSeconds: assignment.card_deadline_seconds };
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

export type CardAttempt = AttemptState & {
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
  const created = await api<CardAttempt>('training/attempts', { id: crypto.randomUUID(), assignment_id: assignment.id });
  const attempt = await api<CardAttempt>(`training/attempts/${created.id}`);
  return { assignment, attempt };
}

export type AttemptEvent = {
  type: string;
  created_at: string;
  actor_id?: string | null;
  source?: string;
  payload: { status?: string; comment?: string; crew?: string; party?: string;
    direction?: string; topic?: string; report_status?: string; message?: string; audio?: string };
};

export async function attemptEvents(id: string) {
  return api<AttemptEvent[]>(`training/attempts/${id}/events?after=0`);
}

export type DdsServiceState = {
  service: string; status: string; started_at: string | null;
  history: { status: string; comment: string; created_at: string; actor: string }[];
};

export function ddsServiceStates(id: string) {
  return api<DdsServiceState[]>(`training/attempts/${id}/services`);
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

export function previewDdsPhone(id: string, party: 'crew' | 'caller', direction: 'incoming' | 'outgoing', topic?: string) {
  const query = new URLSearchParams({ party, direction });
  if (topic) query.set('topic', topic);
  return api<PhoneReport>(`training/attempts/${id}/phone?${query}`);
}

export function recordDdsPhone(id: string, party: 'crew' | 'caller', direction: 'incoming' | 'outgoing', topic?: string) {
  return postDdsCommand(id, 'dds.phone.report', { party, direction, ...(topic ? { topic } : {}) });
}
