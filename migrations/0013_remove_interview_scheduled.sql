INSERT INTO application_review_history (
  application_id,
  previous_status,
  new_status,
  previous_notes,
  new_notes,
  previous_tags_json,
  new_tags_json,
  changed_at,
  changed_by
)
SELECT
  application_id,
  'interview_scheduled',
  'contacted',
  admin_notes,
  admin_notes,
  tags_json,
  tags_json,
  CURRENT_TIMESTAMP,
  'system:migration-0013'
FROM applicant_details
WHERE application_status = 'interview_scheduled';

UPDATE applicant_details
SET application_status = 'contacted',
    reviewed_at = COALESCE(reviewed_at, CURRENT_TIMESTAMP)
WHERE application_status = 'interview_scheduled';
