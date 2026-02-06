-- Remove links between goals and meetings first to avoid the foreign key error
UPDATE goals SET linked_meeting_id = NULL;

-- Now you can delete all meetings
DELETE FROM meetings;

-- If you also want to delete the goals themselves (optional), uncomment the next line:
-- DELETE FROM goals;
