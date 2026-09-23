import { api } from '../api';
import type { Assignment } from '../management/types';

export async function startAssignedAttempt(learnerId: string, assignmentId: string): Promise<string> {
  if (!assignmentId) throw new Error('Выберите задание в разделе «Мои задания».');
  const assignments = await api<Assignment[]>('training/assignments');
  const assignment = assignments.find((item) => item.id === assignmentId && item.learner_id === learnerId
    && item.mode === 'call' && item.status === 'active');
  if (!assignment) throw new Error('Задание недоступно. Возможно, преподаватель уже завершил занятие.');
  if (assignment.attempt_id && assignment.attempt_status && ['created', 'active', 'suspended'].includes(assignment.attempt_status)) {
    return assignment.attempt_id;
  }
  return (await api<{ id: string }>('training/attempts', {
    id: crypto.randomUUID(), assignment_id: assignment.id,
  })).id;
}

export function finishAttempt(id: string, failed = false) {
  return api<void>(`training/attempts/${id}/finish`, { failed });
}
