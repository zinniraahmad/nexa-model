CREATE TABLE IF NOT EXISTS training_sessions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  session_number INTEGER NOT NULL CHECK (session_number >= 1),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'PAUSED')),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (candidate_id, session_number),
  FOREIGN KEY (candidate_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS training_poses (
  id TEXT PRIMARY KEY,
  training_session_id TEXT NOT NULL,
  pose_number INTEGER NOT NULL CHECK (pose_number >= 1),
  pose_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'NOT_STARTED', 'IN_PROGRESS', 'REDO_REQUIRED', 'APPROVED', 'COMPLETED')),
  instructions TEXT NOT NULL DEFAULT '',
  video_instructions TEXT NOT NULL DEFAULT '',
  reference_image_url TEXT,
  reference_storage_key TEXT,
  video_required INTEGER NOT NULL DEFAULT 0 CHECK (video_required IN (0, 1)),
  internal_admin_note TEXT NOT NULL DEFAULT '',
  trainee_feedback TEXT NOT NULL DEFAULT '',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (training_session_id, pose_number),
  FOREIGN KEY (training_session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pose_attempts (
  id TEXT PRIMARY KEY,
  training_pose_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REDO_REQUIRED', 'INVALID')),
  redo_reasons_json TEXT NOT NULL DEFAULT '[]',
  invalid_reason TEXT,
  correction_effectiveness TEXT CHECK (correction_effectiveness IS NULL OR correction_effectiveness IN ('CORRECTION_APPLIED', 'PARTIALLY_APPLIED', 'NOT_APPLIED')),
  internal_admin_note TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (training_pose_id, attempt_number),
  FOREIGN KEY (training_pose_id) REFERENCES training_poses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS video_attempts (
  id TEXT PRIMARY KEY,
  training_pose_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REDO_REQUIRED', 'INVALID')),
  redo_reasons_json TEXT NOT NULL DEFAULT '[]',
  invalid_reason TEXT,
  raw_footage_verified INTEGER CHECK (raw_footage_verified IS NULL OR raw_footage_verified IN (0, 1)),
  internal_admin_note TEXT NOT NULL DEFAULT '',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (training_pose_id, attempt_number),
  FOREIGN KEY (training_pose_id) REFERENCES training_poses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pose_evaluations (
  training_pose_id TEXT PRIMARY KEY,
  evaluator_id TEXT,
  pose_accuracy INTEGER CHECK (pose_accuracy IS NULL OR pose_accuracy BETWEEN 1 AND 5),
  facial_expression INTEGER CHECK (facial_expression IS NULL OR facial_expression BETWEEN 1 AND 5),
  product_presentation INTEGER CHECK (product_presentation IS NULL OR product_presentation BETWEEN 1 AND 5),
  body_control INTEGER CHECK (body_control IS NULL OR body_control BETWEEN 1 AND 5),
  feedback_responsiveness INTEGER CHECK (feedback_responsiveness IS NULL OR feedback_responsiveness BETWEEN 1 AND 5),
  movement_control INTEGER CHECK (movement_control IS NULL OR movement_control BETWEEN 1 AND 5),
  transition_quality INTEGER CHECK (transition_quality IS NULL OR transition_quality BETWEEN 1 AND 5),
  video_execution_consistency INTEGER CHECK (video_execution_consistency IS NULL OR video_execution_consistency BETWEEN 1 AND 5),
  instruction_compliance INTEGER CHECK (instruction_compliance IS NULL OR instruction_compliance BETWEEN 1 AND 5),
  camera_awareness INTEGER CHECK (camera_awareness IS NULL OR camera_awareness BETWEEN 1 AND 5),
  pose_stability INTEGER CHECK (pose_stability IS NULL OR pose_stability BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_pose_id) REFERENCES training_poses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_evaluations (
  training_session_id TEXT PRIMARY KEY,
  evaluator_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_TO_PUBLISH', 'PUBLISHED')),
  trainee_session_summary TEXT NOT NULL DEFAULT '',
  session_strengths TEXT NOT NULL DEFAULT '',
  session_areas_for_improvement TEXT NOT NULL DEFAULT '',
  next_training_focus TEXT NOT NULL DEFAULT '',
  internal_session_note TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (training_session_id) REFERENCES training_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS candidate_progress_links (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL UNIQUE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TEXT,
  revoked_at TEXT,
  expires_at TEXT,
  FOREIGN KEY (candidate_id) REFERENCES applicants(application_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_training_sessions_candidate ON training_sessions(candidate_id, session_number);
CREATE INDEX IF NOT EXISTS idx_training_poses_session ON training_poses(training_session_id, pose_number);
CREATE INDEX IF NOT EXISTS idx_pose_attempts_pose ON pose_attempts(training_pose_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_video_attempts_pose ON video_attempts(training_pose_id, attempt_number);
CREATE INDEX IF NOT EXISTS idx_session_evaluations_publication ON session_evaluations(status, published_at);
CREATE INDEX IF NOT EXISTS idx_progress_links_token_hash ON candidate_progress_links(token_hash);
