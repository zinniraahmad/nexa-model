-- Preserve compatibility for applications submitted before marital status was collected.
-- New submissions store the selected value in responses_json automatically.
UPDATE applicant_details
SET responses_json = json_set(responses_json, '$.marital_status', NULL)
WHERE json_type(responses_json, '$.marital_status') IS NULL;
