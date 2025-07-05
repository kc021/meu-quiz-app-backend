import express from 'express';
import cors from 'cors';
import prisma from './database/prisma.js'; // Importa o Prisma para a rota de teste
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import questionRoutes from './routes/questionRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import rankingRoutes from './routes/rankingRoutes.js';
import groupRoutes from './routes/groupRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());


// --- ROTA DE TESTE DE DIAGNÓSTICO ---
// Esta rota tentará conectar-se à base de dados para isolar o problema.
app.get('/test-db', async (req, res) => {
  try {
    console.log("A executar teste de conexão com o banco de dados...");
    // Tenta fazer a consulta mais simples possível: contar os utilizadores
    const userCount = await prisma.usuario.count();
    console.log("Consulta bem-sucedida.");
    res.status(200).json({ 
      status: 'sucesso', 
      mensagem: 'Conexão com o banco de dados e consulta bem-sucedida!',
      utilizadoresEncontrados: userCount 
    });
  } catch (error) {
    console.error("ERRO CRÍTICO NO TESTE DE DB:", error);
    res.status(500).json({ 
      status: 'falha',
      erro: 'Não foi possível conectar ou fazer a consulta ao banco de dados.',
      detalhes: error.message
    });
  }
});


// --- ROTAS PRINCIPAIS DA API ---
app.use('/api/auth', authRoutes);
app.use('/api/categorias', categoryRoutes);
app.use('/api/questoes', questionRoutes);
app.use('/api/perfil', profileRoutes);
app.use('/api/ranking', rankingRoutes);
app.use('/api/grupos', groupRoutes);
app.use('/api/jogos', gameRoutes);
app.use('/api/admin', adminRoutes);


export default app;