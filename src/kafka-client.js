import dotenv from 'dotenv';
dotenv.config();

import { Kafka } from 'kafkajs';

export const kafkaClient = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'live-location-tracker',
  brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
});

export const kafkaProducer = kafkaClient.producer();
export const createConsumer = (groupId) => kafkaClient.consumer({ groupId });