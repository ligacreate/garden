-- ⚠️ WARNING: This will delete ALL meetings for ALL users.
-- Use this only during development/testing phase to reset statistics.

DELETE FROM meetings;

-- If you want to delete only YOUR meetings, replace the above with:
-- DELETE FROM meetings WHERE user_id = 'YOUR_USER_ID';
-- (You can find your ID in the 'users' table or Profile view)
