-- Each authorization is its own connection (one per install), linked to the code that created it.
DROP INDEX "OAuthGrant_userId_clientId_key";

ALTER TABLE "OAuthGrant" ADD COLUMN "codeHash" TEXT,
ADD COLUMN "rotatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "OAuthGrant_codeHash_key" ON "OAuthGrant"("codeHash");

CREATE INDEX "OAuthGrant_userId_clientId_idx" ON "OAuthGrant"("userId", "clientId");
