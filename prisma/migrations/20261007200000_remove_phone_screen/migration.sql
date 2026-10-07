-- Phone screen is no longer a status. Existing Phone screen data becomes Interview,
-- the closest match (the company responded and talked to the applicant).
UPDATE "Application" SET "status" = 'INTERVIEW' WHERE "status" = 'PHONE_SCREEN';
UPDATE "Event" SET "toStatus" = 'INTERVIEW' WHERE "toStatus" = 'PHONE_SCREEN';
UPDATE "Event" SET "fromStatus" = 'INTERVIEW' WHERE "fromStatus" = 'PHONE_SCREEN';

-- "Phone screen → Interview" is now "Interview → Interview", which isn't a change; drop it.
DELETE FROM "Event" WHERE "type" = 'STATUS_CHANGE' AND "fromStatus" = "toStatus";

-- Postgres can't remove a value from an enum, so swap in a new type.
CREATE TYPE "ApplicationStatus_new" AS ENUM ('SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Application" ALTER COLUMN "status" TYPE "ApplicationStatus_new" USING ("status"::text::"ApplicationStatus_new");
ALTER TABLE "Event" ALTER COLUMN "fromStatus" TYPE "ApplicationStatus_new" USING ("fromStatus"::text::"ApplicationStatus_new");
ALTER TABLE "Event" ALTER COLUMN "toStatus" TYPE "ApplicationStatus_new" USING ("toStatus"::text::"ApplicationStatus_new");
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
DROP TYPE "ApplicationStatus_old";
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'SAVED';
