import dotenv from 'dotenv';
dotenv.config();

import { kafkaClient } from './kafka-client.js';
import { db } from './db/index.js';
import { locationHistory } from './db/schema.js';

const LOCATION_TOPIC = process.env.KAFKA_TOPIC || 'location-updates';

async function init() {
  console.log('Starting Database Processor...');
  
  const consumer = kafkaClient.consumer({
    groupId: 'database-processor',
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  await consumer.connect();
  console.log('Connected to Kafka');

  await consumer.subscribe({
    topic: LOCATION_TOPIC,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message, heartbeat }) => {
      try {
        const data = JSON.parse(message.value.toString());
        console.log(`[DB-Processor] Processing location for user: ${data.userId}`);

        await db.insert(locationHistory).values({
          userId: data.userId,
          latitude: data.latitude.toString(),
          longitude: data.longitude.toString(),
          accuracy: data.accuracy ? data.accuracy.toString() : null,
          recordedAt: data.timestamp ? new Date(data.timestamp) : new Date(),
        });

        console.log(`[DB-Processor] Saved location for user: ${data.userId}`);
        await heartbeat();
      } catch (error) {
        console.error('[DB-Processor] Error processing message:', error);
        await heartbeat();
      }
    },
  });

  console.log('Database Processor is running and consuming messages...');
}

init().catch((error) => {
  console.error('Fatal error in DB Processor:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\nShutting down Database Processor...');
  process.exit(0);
});