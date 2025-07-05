import prisma from './database/prisma.js';
import jwt from 'jsonwebtoken';

const activeGames = {};
const QUESTION_DURATION_MS = 20000; // 20 segundos

async function enviarProximaQuestao(io, salaId) {
    const gameState = activeGames[salaId];
    if (!gameState) return;

    if (gameState.timer) clearTimeout(gameState.timer);

    gameState.currentQuestionIndex++;
    gameState.respostasDaRodada = {};

    if (gameState.currentQuestionIndex >= gameState.questoes.length) {
        console.log(`[JOGO] Fim de jogo para a sala ${salaId}`);
        io.to(salaId).emit('fimDeJogo', gameState.scores);
        delete activeGames[salaId];
        return;
    }
    
    const proximaQuestao = gameState.questoes[gameState.currentQuestionIndex];
    const { respostaCorreta, ...questaoParaEnviar } = proximaQuestao;
    
    gameState.roundStartTime = Date.now();

    console.log(`[JOGO] A enviar pergunta ${gameState.currentQuestionIndex + 1} para a sala ${salaId}`);
    io.to(salaId).emit('novaPergunta', {
        ...questaoParaEnviar,
        numeroDaQuestao: gameState.currentQuestionIndex + 1,
        totalDeQuestoes: gameState.questoes.length,
        duracao: QUESTION_DURATION_MS / 1000
    });

    gameState.timer = setTimeout(() => {
        finalizarRodada(io, salaId);
    }, QUESTION_DURATION_MS);
}

async function finalizarRodada(io, salaId) {
    const gameState = activeGames[salaId];
    if (!gameState || !gameState.questoes) return;

    console.log(`[JOGO] A finalizar rodada para a sala ${salaId}`);

    if (gameState.timer) clearTimeout(gameState.timer);
    gameState.timer = null;

    const questaoAtual = gameState.questoes[gameState.currentQuestionIndex];
    if (!questaoAtual) return;

    const respostas = gameState.respostasDaRodada;
    const resultadosDaRodada = [];
    
    const sala = await prisma.salaDeJogo.findUnique({
        where: { id: salaId },
        include: { jogadores: { select: { id: true, nome: true } } },
    });

    if (!sala) return;

    for (const jogador of sala.jogadores) {
        const jogadorId = jogador.id;
        const respostaInfo = respostas[jogadorId];
        let pontosGanhos = 0;
        let acertou = false;

        if (respostaInfo && respostaInfo.resposta === questaoAtual.respostaCorreta) {
            acertou = true;
            
            const tempoDeRespostaMs = respostaInfo.tempo - gameState.roundStartTime;
            // Pontuação: max 1000 pontos de bónus, decaindo linearmente com o tempo
            const percentagemDeTempo = tempoDeRespostaMs / QUESTION_DURATION_MS;
            const pontosBonus = Math.round((1 - percentagemDeTempo) * 1000);
            
            pontosGanhos = Math.max(50, 500 + pontosBonus); // 500 base + bónus, com um mínimo de 50

            await prisma.pontuacao.upsert({
                where: { usuarioId: jogadorId },
                update: { pontos: { increment: pontosGanhos } },
                create: { usuarioId: jogadorId, pontos: pontosGanhos },
            });
            
            if (!gameState.scores[jogadorId]) {
                gameState.scores[jogadorId] = { nome: jogador.nome, pontos: 0 };
            }
            gameState.scores[jogadorId].pontos += pontosGanhos;
        }
        resultadosDaRodada.push({ usuarioId: jogadorId, nome: jogador.nome, acertou, pontosGanhos });
    }

    io.to(salaId).emit('fimDaRodada', {
        respostaCorreta: questaoAtual.respostaCorreta,
        resultados: resultadosDaRodada,
    });

    setTimeout(() => enviarProximaQuestao(io, salaId), 5000); // 5 segundos para mostrar os resultados
}


export function setupSocketHandlers(io) {
    io.on('connection', (socket) => {
        console.log(`Cliente conectado: ${socket.id}`);

        socket.on('buscarDetalhesDaSala', async ({ salaId }, callback) => {
            try {
                const sala = await prisma.salaDeJogo.findUnique({
                    where: { id: salaId },
                    include: { jogadores: { select: { id: true, nome: true } } },
                });
                if (sala) {
                    socket.join(sala.id);
                    if (callback) callback({ status: 'ok', sala: sala });
                } else {
                    if (callback) callback({ status: 'erro', mensagem: 'Sala não encontrada.' });
                }
            } catch (error) {
                if (callback) callback({ status: 'erro', mensagem: 'Erro interno do servidor.' });
            }
        });

        socket.on('entrarNaSala', async (data, callback) => {
            try {
                const { codigo, token } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const sala = await prisma.salaDeJogo.findUnique({ where: { codigo } });
                if (!sala) return callback({ erro: 'Sala não encontrada.' });
                
                await prisma.salaDeJogo.update({
                    where: { id: sala.id },
                    data: { jogadores: { connect: { id: decoded.id } } },
                });
                await prisma.usuario.update({ where: { id: decoded.id }, data: { salaDeJogoId: sala.id } });
                
                socket.join(sala.id);
                socket.usuarioId = decoded.id;
                socket.salaId = sala.id;

                if (callback) callback({ salaId: sala.id });

                const salaAtualizada = await prisma.salaDeJogo.findUnique({
                    where: { id: sala.id },
                    include: { jogadores: { select: { id: true, nome: true } } },
                });
                io.to(sala.id).emit('jogadorEntrou', salaAtualizada.jogadores);
            } catch (e) {
                if (callback) callback({ erro: 'Erro ao entrar na sala.' });
            }
        });
        
        socket.on('iniciarJogo', async ({ salaId, token }) => {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const sala = await prisma.salaDeJogo.findUnique({ where: { id: salaId } });
                if (!sala || sala.hostId !== decoded.id || sala.status !== 'AGUARDANDO') return;
                
                const questoes = await prisma.questao.findMany({ where: { categoriaId: sala.categoriaId } });
                if (questoes.length === 0) return io.to(salaId).emit('erroNoJogo', { mensagem: 'Nenhuma questão encontrada.' });

                await prisma.salaDeJogo.update({ where: { id: salaId }, data: { status: 'EM_JOGO' } });
                
                const jogadoresNaSala = await prisma.usuario.findMany({ where: { salaDeJogoId: salaId }, select: { id: true, nome: true } });
                const initialScores = {};
                jogadoresNaSala.forEach(j => {
                    initialScores[j.id] = { nome: j.nome, pontos: 0 };
                });

                activeGames[salaId] = { 
                    questoes, 
                    currentQuestionIndex: -1, 
                    scores: initialScores, 
                    respostasDaRodada: {} 
                };
                
                io.to(salaId).emit('jogoIniciado', { salaId });
                enviarProximaQuestao(io, salaId);
            } catch(e) {
                console.error("ERRO AO INICIAR JOGO", e)
            }
        });

        socket.on('enviarResposta', async (data) => {
            try {
                const { questaoId, resposta, token } = data;
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const usuario = await prisma.usuario.findUnique({ where: { id: decoded.id } });
                if (!usuario || !usuario.salaDeJogoId) return;

                const salaId = usuario.salaDeJogoId;
                const gameState = activeGames[salaId];
        
                if (!gameState || !gameState.questoes[gameState.currentQuestionIndex] || gameState.questoes[gameState.currentQuestionIndex].id !== questaoId || gameState.respostasDaRodada[decoded.id]) return;
                
                gameState.respostasDaRodada[decoded.id] = { resposta: resposta, tempo: Date.now() };
                socket.emit('respostaRecebida');
        
                const sala = await prisma.salaDeJogo.findUnique({ where: { id: salaId }, include: { jogadores: true } });
                const todosResponderam = Object.keys(gameState.respostasDaRodada).length >= sala.jogadores.length;
        
                if (todosResponderam) {
                  finalizarRodada(io, salaId);
                }
            } catch(e) {
                console.error("ERRO AO ENVIAR RESPOSTA", e);
            }
        });

        socket.on('disconnect', () => {
            console.log(`Cliente desconectado: ${socket.id}`);
            // Aqui entraria a lógica futura para remover um jogador de 'activeGames' se ele se desconectar
        });
    });
}