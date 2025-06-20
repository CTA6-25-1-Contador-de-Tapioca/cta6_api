import 'dotenv/config';
import { mqttClient } from './mqtt';
import { client } from './db';
import { z } from 'zod';
import { Point } from '@influxdata/influxdb-client';
import { app } from './http';
import { env } from './config';

const org = env.INFLUX_ORG;
const bucket = env.INFLUX_BUCKET;
const writeClient = client.getWriteApi(org, bucket, 'ns');
const queryClient = client.getQueryApi(org);
const payloadSchema = z.object({
	bagType: z.string(),
	timestamp: z.number(),
	value: z.number(),
});
const port = env.EXPRESS_PORT;

type InfluxDataPoint = {
	timestamp: string;
	count: number;
	bagType: string;
};
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

mqttClient.on('message', async (topic, message) => {
	const payload = JSON.parse(message.toString());
	const data = payloadSchema.safeParse(payload);
	if (!data.success) {
		console.error('❌ Invalid payload:', data.error);
		return;
	}
	const date = new Date(data.data.timestamp);
	const point = new Point('sensor_data')
		.tag('bagType', data.data.bagType)
		.intField('value', data.data.value)
		.timestamp(date);

	writeClient.writePoint(point);
	await writeClient.flush();
});

function getGroupInterval(period: string): string {
	if (period === '1d') return '1h';
	if (period === '7d') return '1d';
	if (period === '30d') return '1d';
	return '1h';
}

app.get('/dados', async (req, res) => {
	const period = req.query.period;
	const groupInterval = getGroupInterval(period as string);

	const query = `
    from(bucket: "${bucket}")
      |> range(start: -${period})
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r._field == "value")
      |> aggregateWindow(every: ${groupInterval}, fn: count, createEmpty: false)
      |> group(columns: ["_time", "bagType"])
      |> sort(columns: ["_time"])
  `;

	const result: InfluxDataPoint[] = [];

	try {
		queryClient.queryRows(query, {
			next(row, tableMeta) {
				const o = tableMeta.toObject(row);
				result.push({
					timestamp: o._time,
					count: o._value,
					bagType: o.bagType,
				});
			},
			error(error) {
				console.error(error);
				res.status(500).send('Erro ao consultar o InfluxDB');
			},
			complete() {
				res.json(result);
			},
		});
	} catch (err) {
		res.status(500).send('Erro inesperado');
	}
});

app.listen(port, () => {
	console.log(`✅ Server is running on ${port}`);
});
