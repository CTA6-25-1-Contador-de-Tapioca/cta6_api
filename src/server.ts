import 'dotenv/config';
import { mqttClient } from './mqtt';
import { client } from './db';
import { z } from 'zod';

const org = 'teste';
const bucket = 'teste';
const writeClient = client.getWriteApi(org, bucket, 'ns');
const payloadSchema = z.object({
	bagType: z.string(),
	timestamp: z.string(),
	value: z.number(),
});
mqttClient.on('connect', () => {
	console.log('✅ MQTT client connected successfully');
	const topics = ['pedro.neto.704@ufrn.edu.br/teste'];

	mqttClient.subscribe(topics, (err) => {
		if (err) {
			console.error('❌ Failed to subscribe to topics:', err);
		} else {
			console.log(`✅ Subscribed to topics: ${topics.join(', ')}`);
		}
	});
});

mqttClient.on('message', (topic, message) => {
	console.log(`Received message on topic ${topic}:`, message.toString());
	const payload = JSON.parse(message.toString());
	const data = payloadSchema.safeParse(payload);
	if (!data.success) {
		console.error('❌ Invalid payload:', data.error);
		return;
	}
});
