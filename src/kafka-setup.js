import dotenv from 'dotenv';
dotenv.config();

import { kafkaClient } from './kafka-client.js';

async function setup() {
  const admin = kafkaClient.admin();
  await admin.connect();
  
  const topics = await admin.listTopics();
  console.log('Existing topics:', topics);

  const topicName = process.env.KAFKA_TOPIC || 'location-updates';
  
  if (!topics.includes(topicName)) {
    await admin.createTopics({
      topics: [
        { 
          topic: topicName, 
          numPartitions: 2,
          replicationFactor: 1,
          configEntries: [
            { name: 'retention.ms', value: '604800000' }, // 7 days retention
          ],
        },
      ],
    });
    console.log(`Topic '${topicName}' created successfully`);
  } else {
    console.log(`Topic '${topicName}' already exists`);
  }

  await admin.disconnect();
  console.log('Kafka setup complete');
}

setup().catch(console.error);