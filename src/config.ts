import { z } from 'zod';

const envSchema = z.object({
	MQTT_BROKER_URL: z.string().url(),
	MQTT_USERNAME: z.string(),
	MQTT_PASSWORD: z.string(),

	INFLUX_URL: z.string().url(),
	INFLUX_TOKEN: z.string(),
	INFLUX_ORG: z.string(),
	INFLUX_BUCKET: z.string(),

	NODE_ENV: z.enum(['development', 'production', 'test']),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
	console.error(
		'❌ Erro ao validar variáveis de ambiente:',
		_env.error.format(),
	);
	process.exit(1);
}

export const env = _env.data;
