const express = require("express");
const cors = require("cors");

const app = express();

/* =========================
   CORS CONFIG (CORRIGIDO)
========================= */
const corsOptions = {
  origin: [
    "https://www.courvanlicitacoes.com.br",
    "https://courvanlicitacoes.com.br"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use(express.json());

/* =========================
   RADAR IMPORT
========================= */
const { buscarLicitacoes } = require("../radar");

/* =========================
   RUN RADAR ENDPOINT
========================= */
app.post("/run-radar", async (req, res) => {
  try {
    console.log("🚀 Executando radar...");

    const resultado = await buscarLicitacoes();

    return res.status(200).json({
      ok: true,
      ...resultado
    });

  } catch (error) {
    console.error("Erro ao executar /run-radar:", error);

    return res.status(500).json({
      ok: false,
      error: "Erro ao executar radar",
      detail: error?.message || "Falha interna"
    });
  }
});

/* =========================
   HEALTH CHECK (opcional mas útil)
========================= */
app.get("/", (req, res) => {
  res.send("Courvan API rodando 🚀");
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
