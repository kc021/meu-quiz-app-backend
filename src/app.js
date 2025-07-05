import express from 'express';
import cors from 'cors'; // <-- 1. Importa o cors
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import adminRoutes from './routes/adminRoutes.js'; 

const app = express();

// 2. Usa o middleware de CORS.
// Isso permite que o nosso frontend em localhost:5173 faça pedidos para este backend.
app.use(cors()); 

app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/categorias', categoryRoutes);
app.use('/api/questoes', questionRoutes);
app.use('/api/perfil', profileRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/grupos', groupRoutes);
app.use('/api/jogos', gameRoutes);
app.use('/api/admin', adminRoutes);

export default app;