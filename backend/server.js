const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// IMPORTA SUA FUNÇÃO DO RADAR
const { buscarLicitacoes } = require("../radar");

app.post("/run-radar", async (req, res) => {
  try {
    const resultado = await buscarLicitacoes();
    res.json(resultado);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Erro ao executar radar" });
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});
