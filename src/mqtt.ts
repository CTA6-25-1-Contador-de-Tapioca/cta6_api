import mqtt from 'mqtt';
import { env } from './config';

export const mqttClient = mqtt.connect(env.MQTT_BROKER_URL, {
	username: env.MQTT_USERNAME,
	password: env.MQTT_PASSWORD,
});
