ALTER TABLE app_user DROP CONSTRAINT app_user_role_check;
UPDATE app_user SET role = 'instructor' WHERE role = 'teacher';
ALTER TABLE app_user ADD CONSTRAINT app_user_role_check
    CHECK (role IN ('user', 'instructor', 'admin'));

ALTER TABLE training_group RENAME COLUMN teacher_id TO instructor_id;
ALTER TABLE evaluation_review RENAME COLUMN teacher_id TO instructor_id;
ALTER TABLE teaching_material RENAME COLUMN teacher_id TO instructor_id;
