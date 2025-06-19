import 'dotenv/config';
import mqtt from 'mqtt';
import { env } from './config';

const mqttClient = mqtt.connect(env.MQTT_BROKER_URL, {
	username: env.MQTT_USERNAME,
	password: env.MQTT_PASSWORD,
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
