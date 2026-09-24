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
