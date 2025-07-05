import app from './app.js';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupSocketHandlers } from './socketHandler.js'; // <-- 1. Importa o nosso gestor

dotenv.config();

const PORT = process.env.PORT || 3001;
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 2. Chama a função para configurar todos os eventos do Socket.IO
setupSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta http://localhost:${PORT}`);
  console.log('⚡️ Servidor Socket.IO pronto para conexões.');
});