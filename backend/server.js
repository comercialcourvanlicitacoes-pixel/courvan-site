const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Importa função principal do radar
const { buscarLicitacoes } = require("../radar");

app.post("/run-radar", async (req, res) => {
  try {
    const resultado = await buscarLicitacoes();
    res.status(200).json(resultado);
  } catch (error) {
    console.error("Erro ao executar /run-radar:", error);

    // Mantém resposta amigável para frontend
    res.status(500).json({
      ok: false,
      error: "Erro ao executar radar",
      detail: error?.message || "Falha interna"
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
