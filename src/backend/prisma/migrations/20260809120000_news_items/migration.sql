CREATE TABLE "NewsItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "type" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" DATETIME NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "NewsItem_eventKey_key" ON "NewsItem"("eventKey");
CREATE INDEX "NewsItem_publishedAt_priority_idx" ON "NewsItem"("publishedAt", "priority");
CREATE INDEX "NewsItem_read_publishedAt_idx" ON "NewsItem"("read", "publishedAt");
CREATE INDEX "NewsItem_topic_publishedAt_idx" ON "NewsItem"("topic", "publishedAt");
