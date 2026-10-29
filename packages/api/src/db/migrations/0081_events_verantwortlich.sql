-- Optional responsible member of an event (Cognito sub of a member with a profile; checked by the API, no foreign key).
ALTER TABLE events ADD COLUMN IF NOT EXISTS verantwortlich_sub text
