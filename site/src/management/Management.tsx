import { useAuth } from '../auth/AuthContext';
import { AdminDesk } from './AdminDesk';
import { TeacherWorkspace } from './TeacherWorkspace';

export function Management() {
  const { user } = useAuth();
  return user.role === 'admin' ? <AdminDesk /> : user.role === 'teacher' ? <TeacherWorkspace /> : null;
}
