import express from 'express';
import { Server } from 'socket.io';
import http from 'http';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
	cors: {
		origin: '*',
	},
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

export { app, io };
