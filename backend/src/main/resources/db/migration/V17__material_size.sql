ALTER TABLE teaching_material
    DROP CONSTRAINT teaching_material_byte_size_check;

ALTER TABLE teaching_material
    ADD CONSTRAINT teaching_material_byte_size_check
    CHECK (byte_size BETWEEN 1 AND 8388608);
