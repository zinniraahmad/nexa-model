PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS applicant_photos (
  file_id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  photo_type TEXT NOT NULL,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_review_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  previous_notes TEXT NOT NULL DEFAULT '',
  new_notes TEXT NOT NULL DEFAULT '',
  previous_tags_json TEXT NOT NULL DEFAULT '[]',
  new_tags_json TEXT NOT NULL DEFAULT '[]',
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_by TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS application_deletion_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL,
  applicant_name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  deletion_type TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  performed_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_security_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  actor_email TEXT,
  request_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_operational_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  event_name TEXT NOT NULL,
  http_status INTEGER,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_operational_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  service TEXT NOT NULL,
  event_count INTEGER NOT NULL,
  window_started_at TEXT NOT NULL,
  alerted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS email_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  resend_email_id TEXT UNIQUE,
  application_id TEXT,
  message_type TEXT NOT NULL,
  recipient_type TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_http_status INTEGER,
  failure_code TEXT,
  daily_quota_used INTEGER,
  monthly_quota_used INTEGER,
  rate_limit_remaining INTEGER,
  rate_limit_reset_seconds INTEGER,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  FOREIGN KEY (application_id) REFERENCES applicants(application_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS website_controls (
  control_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

INSERT OR IGNORE INTO website_controls (control_key, enabled)
VALUES ('applications_closed', 0);

INSERT INTO applicants (application_id, full_name, email, phone, current_location)
VALUES
  ('local-ui-complete', 'Alya Demo Candidate', 'alya.demo@example.test', '012-345 6789', 'Shah Alam, Selangor'),
  ('local-ui-reviewing', 'Bella Reviewing Demo', 'bella.demo@example.test', '+601123456789', 'Petaling Jaya, Selangor'),
  ('local-ui-shortlisted', 'Chloe Shortlisted Demo', 'chloe.demo@example.test', '+60129876543', 'Kuala Lumpur'),
  ('local-ui-contacted', 'Dina Contacted Demo', 'dina.demo@example.test', '+60176543210', 'Johor Bahru, Johor'),
  ('local-ui-rejected', 'Elena Rejected Demo', 'elena.demo@example.test', '+60165550123', 'George Town, Penang')
ON CONFLICT(application_id) DO UPDATE SET
  full_name = excluded.full_name,
  email = excluded.email,
  phone = excluded.phone,
  current_location = excluded.current_location,
  deleted_at = NULL,
  delete_after = NULL,
  deleted_by = NULL,
  deletion_type = NULL;

INSERT INTO applicant_details (
  application_id, responses_json, application_status, submitted_at,
  admin_notes, reviewed_at, reviewed_by, tags_json, shortlisted_email_sent_at
)
VALUES
  (
    'local-ui-complete',
    '{"email":"alya.demo@example.test","age_gate":"Yes","information_consent":["I understand and agree to proceed."],"voluntary_application":"Yes","full_name":"Alya Demo Candidate","preferred_name":"Alya","age":26,"gender":"Female","marital_status":"Single","current_state":"Selangor","current_location":"Shah Alam, Selangor","phone":"012-345 6789","instagram":"https://instagram.com/alya.demo","tiktok":"@alya.demo","other_portfolio_link":"https://example.test/alya-portfolio","height_cm":168,"weight_kg":54,"clothing_size":"S","skin_tone":"Warm Light Skin Tone (Kuning Langsat)","body_type":"Rectangle / Straight — bahu, pinggang dan pinggul nampak agak seimbang/lurus.","modelling_experience":"Yes","experience_details":"Two lifestyle catalogue shoots and one activewear campaign.","activewear_experience":"Yes","has_portfolio":"Yes","portfolio_link":"https://example.test/alya-portfolio","photoshoot_styles":["Casual / Lifestyle","Fashion","Sportswear / Activewear","Product Modelling"],"posing_experience":4,"pose_comfort":"Yes, I am comfortable.","pose_boundaries":"No floor poses on rough outdoor surfaces.","visual_reference_comfort":"Yes","rates_acknowledged":["I understand."],"training_willing":"Yes","home_training_comfort":"Yes","feedback_comfort":"Yes","improvement_areas":["Facial expression","Camera angles","Following pose references"],"previous_online_training":"No","device_type":"iPhone","device_model":"iPhone 15","tripod":"Yes","lighting_setup":["Natural lighting / Window light","Ring light"],"capture_help":"A friend or family member will help me","photographer_use":"No, I will manage myself or with someone I know","photographer_weekends":"Not applicable","drive_upload_comfort":"Yes","weekend_availability":["Saturday Afternoon","Sunday Morning"],"weekday_availability":"Sometimes","preferred_session_time":["Afternoon","Flexible"],"start_availability":"Immediately","regular_commitments":"Available after 2 pm on Saturdays.","privacy_notice_consent":["I understand and agree."],"accurate_information":["I confirm."],"no_guarantee_acknowledged":["I understand."],"whatsapp_consent":["Yes, I consent."],"profile_sharing_consent":"Yes, I consent.","additional_notes":"Local-only dummy record for checking the complete Admin candidate UI."}',
    'submitted', datetime('now', '-1 day'),
    'Strong complete demo profile. Safe to edit during local UI testing.', datetime('now', '-12 hours'),
    'local-admin@nexa.test', '["complete-profile","activewear","selangor"]', NULL
  ),
  ('local-ui-reviewing', '{"age":23,"marital_status":"In a relationship","height_cm":165,"current_location":"Petaling Jaya, Selangor"}', 'reviewing', datetime('now', '-3 days'), 'Review in progress.', datetime('now', '-2 days'), 'local-admin@nexa.test', '["reviewing"]', NULL),
  ('local-ui-shortlisted', '{"age":25,"marital_status":"Single","height_cm":172,"current_location":"Kuala Lumpur"}', 'shortlisted', datetime('now', '-7 days'), 'Shortlisted demo record.', datetime('now', '-6 days'), 'local-admin@nexa.test', '["shortlisted"]', datetime('now', '-6 days')),
  ('local-ui-contacted', '{"age":28,"marital_status":"Married","height_cm":170,"current_location":"Johor Bahru, Johor"}', 'contacted', datetime('now', '-14 days'), 'Contacted and available for training UI.', datetime('now', '-10 days'), 'local-admin@nexa.test', '["contacted","training"]', datetime('now', '-12 days')),
  ('local-ui-rejected', '{"age":22,"marital_status":"Single","height_cm":160,"current_location":"George Town, Penang"}', 'rejected', datetime('now', '-21 days'), 'Rejected demo record.', datetime('now', '-20 days'), 'local-admin@nexa.test', '["rejected"]', NULL)
ON CONFLICT(application_id) DO UPDATE SET
  responses_json = excluded.responses_json,
  application_status = excluded.application_status,
  submitted_at = excluded.submitted_at,
  admin_notes = excluded.admin_notes,
  reviewed_at = excluded.reviewed_at,
  reviewed_by = excluded.reviewed_by,
  tags_json = excluded.tags_json,
  shortlisted_email_sent_at = excluded.shortlisted_email_sent_at;

DELETE FROM application_review_history
WHERE application_id LIKE 'local-ui-%';

INSERT INTO application_review_history (
  application_id, previous_status, new_status, previous_notes, new_notes,
  previous_tags_json, new_tags_json, changed_at, changed_by
)
VALUES
  ('local-ui-complete', 'submitted', 'submitted', '', 'Strong complete demo profile. Safe to edit during local UI testing.', '[]', '["complete-profile","activewear","selangor"]', datetime('now', '-12 hours'), 'local-admin@nexa.test'),
  ('local-ui-reviewing', 'submitted', 'reviewing', '', 'Review in progress.', '[]', '["reviewing"]', datetime('now', '-2 days'), 'local-admin@nexa.test'),
  ('local-ui-shortlisted', 'reviewing', 'shortlisted', 'Review completed.', 'Shortlisted demo record.', '["reviewing"]', '["shortlisted"]', datetime('now', '-6 days'), 'local-admin@nexa.test'),
  ('local-ui-contacted', 'shortlisted', 'contacted', 'Shortlisted demo record.', 'Contacted and available for training UI.', '["shortlisted"]', '["contacted","training"]', datetime('now', '-10 days'), 'local-admin@nexa.test'),
  ('local-ui-rejected', 'reviewing', 'rejected', 'Review completed.', 'Rejected demo record.', '["reviewing"]', '["rejected"]', datetime('now', '-20 days'), 'local-admin@nexa.test');

INSERT OR IGNORE INTO email_messages (
  resend_email_id, application_id, message_type, recipient_type, status,
  provider_http_status, daily_quota_used, monthly_quota_used, attempted_at, accepted_at
)
VALUES
  ('local-demo-email-1', 'local-ui-complete', 'candidate_receipt', 'candidate', 'accepted', 200, 4, 18, datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('local-demo-email-2', 'local-ui-shortlisted', 'candidate_shortlisted', 'candidate', 'accepted', 200, 5, 19, datetime('now', '-6 days'), datetime('now', '-6 days')),
  ('local-demo-email-3', 'local-ui-reviewing', 'admin_notification', 'admin', 'failed', 503, 6, 20, datetime('now', '-2 days'), NULL);
