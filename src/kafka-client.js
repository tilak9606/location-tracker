import { Kafka } from 'kafkajs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProduction = process.env.NODE_ENV === 'production';

const cleanBroker = (url) => {
  if (!url) return 'localhost:9092';
  return url
    .replace(/^https?:\/\//, '')    
    .replace(/^kafka:\/\//, '')
    .replace(/\/$/, '')          
    .replace(/^[^@]+@/, '');     
};

const brokerUrl = cleanBroker(process.env.KAFKA_BROKER);

console.log('Kafka Config:', {
  broker: brokerUrl,
  clientId: process.env.KAFKA_CLIENT_ID,
  isProduction,
  hasUsername: !!process.env.KAFKA_USERNAME,
  hasPassword: !!process.env.KAFKA_PASSWORD,
});

const kafkaConfig = {
  clientId: process.env.KAFKA_CLIENT_ID || 'live-location-tracker',
  brokers: [brokerUrl],
};

if (isProduction) {
  const caPath = path.join(process.cwd(), 'ca.pem');
  
  // Check if ca.pem exists
  if (!fs.existsSync(caPath)) {
    console.error('ca.pem not found at:', caPath);
    console.error('Please download CA certificate from Aiven console and save as ca.pem');
    process.exit(1);
  }

  kafkaConfig.ssl = {
    ca: [fs.readFileSync(caPath, 'utf-8')],
    rejectUnauthorized: true,
  };
  
  kafkaConfig.sasl = {
    mechanism: 'plain',
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD,
  };
}

export const kafkaClient = new Kafka(kafkaConfig);
export const kafkaProducer = kafkaClient.producer();
export const createConsumer = (groupId) => kafkaClient.consumer({ groupId });