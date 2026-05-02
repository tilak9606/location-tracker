import { eq, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users, locationHistory, activeSessions } from '../db/schema.js';

export const saveLocation = async (userId, latitude, longitude, accuracy = null) => {
  const [record] = await db.insert(locationHistory).values({
    userId,
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    accuracy: accuracy ? accuracy.toString() : null,
  }).returning();

  return record;
};

export const getLocationHistory = async (userId, limit = 100) => {
  return await db.select({
    latitude: locationHistory.latitude,
    longitude: locationHistory.longitude,
    accuracy: locationHistory.accuracy,
    recordedAt: locationHistory.recordedAt,
  }).from(locationHistory)
    .where(eq(locationHistory.userId, userId))
    .orderBy(desc(locationHistory.recordedAt))
    .limit(limit);
};

export const updateSession = async (userId, socketId, isOnline = true) => {
  // Upsert using onConflictDoUpdate
  const existing = await db.select().from(activeSessions)
    .where(eq(activeSessions.socketId, socketId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(activeSessions)
      .set({ userId, isOnline, lastSeenAt: new Date() })
      .where(eq(activeSessions.socketId, socketId));
  } else {
    await db.insert(activeSessions).values({
      userId,
      socketId,
      isOnline,
      lastSeenAt: new Date(),
    });
  }
};

export const removeSession = async (socketId) => {
  await db.update(activeSessions)
    .set({ isOnline: false, lastSeenAt: new Date() })
    .where(eq(activeSessions.socketId, socketId));
};

export const getOnlineUsers = async () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  return await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
  }).from(users)
    .innerJoin(activeSessions, eq(users.id, activeSessions.userId))
    .where(
      sql`${activeSessions.isOnline} = true AND ${activeSessions.lastSeenAt} > ${twoMinutesAgo}`
    );
};

export const cleanupStaleSessions = async () => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  const stale = await db.update(activeSessions)
    .set({ isOnline: false })
    .where(
      sql`${activeSessions.isOnline} = true AND ${activeSessions.lastSeenAt} < ${twoMinutesAgo}`
    )
    .returning({
      userId: activeSessions.userId,
      socketId: activeSessions.socketId,
    });

  return stale;
};