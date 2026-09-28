CREATE INDEX training_attempt_case_id_idx
    ON training_attempt ((card_template->>'case_id'));
