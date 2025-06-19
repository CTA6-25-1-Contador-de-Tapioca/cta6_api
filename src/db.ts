import { InfluxDB } from '@influxdata/influxdb-client';
import { env } from './config';

const token = env.INFLUX_TOKEN;
const url = 'http://localhost:8086';

export const client = new InfluxDB({ url, token });
