import express from 'express';
const app = express();
const port = process.env.PORT || 3001;

app.get('/', (req, res) => {
  res.send('Servidor "Hello World" está a funcionar!');
});

app.listen(port, () => {
  console.log(`Servidor simples a rodar na porta ${port}`);
});