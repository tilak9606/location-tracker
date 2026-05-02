import { pgTable, uuid, varchar, timestamp, decimal, boolean, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }),
    refreshToken: varchar('refresh_token', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const locationHistory = pgTable('location_history', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    latitude: decimal('latitude', { precision: 10, scale: 8 }).notNull(),
    longitude: decimal('longitude', { precision: 11, scale: 8 }).notNull(),
    accuracy: decimal('accuracy', { precision: 10, scale: 2 }),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
    userIdIdx: index('idx_location_history_user_id').on(table.userId),
    recordedAtIdx: index('idx_location_history_recorded_at').on(table.recordedAt),
}));

export const activeSessions = pgTable('active_sessions', {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    socketId: varchar('socket_id', { length: 255 }).notNull(),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
    isOnline: boolean('is_online').default(true),
}, (table) => ({
    userIdIdx: index('idx_active_sessions_user_id').on(table.userId),
    socketIdIdx: index('idx_active_sessions_socket_id').on(table.socketId),
}));