import { Point } from '@influxdata/influxdb-client';
import 'dotenv/config';
import { z } from 'zod';
import { env } from './config';
import { client } from './db';
import { app, io, server } from './http';
import { mqttClient } from './mqtt';

const org = env.INFLUX_ORG;
const bucket = env.INFLUX_BUCKET;
const writeClient = client.getWriteApi(org, bucket, 'ms');
const queryClient = client.getQueryApi(org);
const payloadSchema = z.object({
	bagType: z.string(),
	value: z.number(),
});
const port = env.EXPRESS_PORT;
const filtrosPorSocket = new Map<string, string>();

type InfluxDataPoint = {
	timestamp: Date;
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

	const date = new Date();

	const point = new Point('sensor_data')
		.tag('bagType', data.data.bagType)
		.intField('value', data.data.value)
		.timestamp(date);

	writeClient.writePoint(point);
	await writeClient.flush();

	const isoTimestamp = date.toISOString(); // timestamp real, não arredondado

	io.emit('byBagType', {
		bagType: data.data.bagType,
		count: 1,
	});

	for (const [id, bagType] of filtrosPorSocket.entries()) {
		if (bagType === data.data.bagType) {
			const socket = io.sockets.sockets.get(id);
			if (socket) {
				socket.emit('novo-dado', {
					bagType: data.data.bagType,
					timestamp: isoTimestamp,
					value: data.data.value,
				});
				socket.emit('daily', {
					count: 1,
				});
			}
		}
	}
});

app.get('/dados', async (req, res) => {
	const period = req.query.period as string;
	const bagType = req.query.bagType as string;
	const groupInterval = req.query.groupInterval as string;

	const bagTypeFilter = bagType
		? `|> filter(fn: (r) => r["bagType"] == "${bagType}")`
		: '';
	const rangeFilter =
		period === 'today'
			? '|> range(start: today())'
			: `|> range(start: -${period})`;

	const query = `
	from(bucket: "${bucket}")
		${rangeFilter}
		|> filter(fn: (r) => r._measurement == "sensor_data")
		|> filter(fn: (r) => r._field == "value")
		${bagTypeFilter}
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

app.get('/dados/daily', async (req, res) => {
	const bagType = req.query.bagType as string;

	if (!bagType) {
		res.status(400).send('Parâmetro "bagType" é obrigatório.');
		return;
	}

	const query = `
    from(bucket: "${bucket}")
      |> range(start: today())
      |> filter(fn: (r) => r._measurement == "sensor_data")
      |> filter(fn: (r) => r._field == "value")
      |> filter(fn: (r) => r["bagType"] == "${bagType}")
      |> aggregateWindow(every: 1d, fn: count, createEmpty: false)
      |> group(columns: ["bagType"])
      |> sum()
  `;

	let total = 0;

	try {
		queryClient.queryRows(query, {
			next(row, tableMeta) {
				const o = tableMeta.toObject(row);
				total = o._value;
			},
			error(error) {
				console.error(error);
				res.status(500).send('Erro ao consultar o InfluxDB');
			},
			complete() {
				res.json({
					bagType,
					countToday: total,
				});
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).send('Erro inesperado');
	}
});

app.get('/dados/byBagType', async (req, res) => {
	const period = req.query.period as string;

	if (!period) {
		res.status(400).send('Parâmetro "period" é obrigatório.');
		return;
	}

	const rangeFilter =
		period === 'today'
			? '|> range(start: today())'
			: `|> range(start: -${period})`;

	const query = `
		from(bucket: "${bucket}")
			${rangeFilter}
			|> filter(fn: (r) => r._measurement == "sensor_data")
			|> filter(fn: (r) => r._field == "value")
			|> group(columns: ["bagType"])
			|> count()
			|> keep(columns: ["_value", "bagType"])
	`;

	const result: { bagType: string; count: number }[] = [];

	try {
		queryClient.queryRows(query, {
			next(row, tableMeta) {
				const o = tableMeta.toObject(row);
				result.push({
					bagType: o.bagType,
					count: o._value,
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
		console.error(err);
		res.status(500).send('Erro inesperado');
	}
});

app.get('/dados/avgPerHour', async (req, res) => {
	const bagType = req.query.bagType as string;

	if (!bagType) {
		res.status(400).send('Parâmetro "bagType" é obrigatório.');
		return;
	}

	const query = `
		from(bucket: "${bucket}")
			|> range(start: today())
			|> filter(fn: (r) => r._measurement == "sensor_data")
			|> filter(fn: (r) => r._field == "value")
			|> filter(fn: (r) => r.bagType == "${bagType}")
			|> aggregateWindow(every: 1h, fn: sum, createEmpty: false)
			|> mean()
			|> keep(columns: ["_value"])
	`;

	try {
		let averagePerHour = 0;

		queryClient.queryRows(query, {
			next(row, tableMeta) {
				const o = tableMeta.toObject(row);
				averagePerHour = o._value;
			},
			error(error) {
				console.error(error);
				res.status(500).send('Erro ao consultar o InfluxDB');
			},
			complete() {
				res.json({ averagePerHour });
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).send('Erro inesperado');
	}
});

app.get('/dados/productionDuration', async (req, res) => {
	const query = `
		from(bucket: "${bucket}")
			|> range(start: today())
			|> filter(fn: (r) => r._measurement == "sensor_data")
			|> filter(fn: (r) => r._field == "value")
			|> sort(columns: ["_time"], desc: false)
			|> limit(n: 1)
	`;

	try {
		let productionStartTime: string | null = null;

		queryClient.queryRows(query, {
			next(row, tableMeta) {
				const o = tableMeta.toObject(row);
				productionStartTime = o._time;
			},
			error(error) {
				console.error(error);
				res.status(500).send('Erro ao consultar o InfluxDB');
			},
			complete() {
				if (!productionStartTime) {
					res.status(404).send('Nenhum dado de produção encontrado para hoje.');
					return;
				}

				const now = new Date();
				const start = new Date(productionStartTime);
				const diffMs = Math.abs(now.getTime() - start.getTime());
				const formattedDuration = new Date(diffMs).toISOString().slice(11, 19);

				res.json({ duration: formattedDuration }); // Exemplo: "01:27:42"
			},
		});
	} catch (err) {
		console.error(err);
		res.status(500).send('Erro inesperado');
	}
});


io.on('connection', (socket) => {
	console.log(`Socket conectado: ${socket.id}`);

	socket.on('subscribe', ({ bagType }) => {
		filtrosPorSocket.set(socket.id, bagType);
	});

	socket.on('disconnect', () => {
		filtrosPorSocket.delete(socket.id);
	});
});

server.listen(port, () => {
	console.log(`✅ Server is running on ${port}`);
});
