import { api } from '../api';
import type { Assignment } from '../management/types';

export type AssignedAttempt = { id: string; phone: string };

export async function startAssignedAttempt(learnerId: string, assignmentId: string): Promise<AssignedAttempt> {
  if (!assignmentId) throw new Error('Входящий звонок не найден. Вернитесь к списку происшествий.');
  const assignments = await api<Assignment[]>('training/assignments');
  const assignment = assignments.find((item) => item.id === assignmentId && item.learner_id === learnerId
    && item.mode === 'call' && item.status === 'active');
  if (!assignment) throw new Error('Задание недоступно. Возможно, преподаватель уже завершил занятие.');
  if (assignment.attempt_id && assignment.attempt_status && ['created', 'active', 'suspended'].includes(assignment.attempt_status)) {
    return { id: assignment.attempt_id, phone: assignment.caller_phone?.trim() ?? '' };
  }
  const attempt = await api<{ id: string }>('training/attempts', {
    id: crypto.randomUUID(), assignment_id: assignment.id,
  });
  return { id: attempt.id, phone: assignment.caller_phone?.trim() ?? '' };
}

export function finishAttempt(id: string, failed = false) {
  return api<void>(`training/attempts/${id}/finish`, { failed });
}
