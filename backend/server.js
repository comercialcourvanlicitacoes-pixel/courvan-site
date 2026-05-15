 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/backend/server.js b/backend/server.js
index 8f69078020758a4b835dfe20457af0ffa145e22e..71e53cd2b7191264cd53c5a0daf198122231952b 100644
--- a/backend/server.js
+++ b/backend/server.js
@@ -1,23 +1,23 @@
 const express = require("express");
 const cors = require("cors");
 
 const app = express();
 app.use(cors());
 app.use(express.json());
 
 // IMPORTA SUA FUNÇÃO DO RADAR
-const { buscarLicitacoes } = require("./radar");
+const { buscarLicitacoes } = require("../radar");
 
 app.post("/run-radar", async (req, res) => {
   try {
-    await buscarLicitacoes();
-    res.json({ ok: true, message: "Radar executado" });
+    const resultado = await buscarLicitacoes();
+    res.json(resultado);
   } catch (error) {
     console.log(error);
     res.status(500).json({ error: "Erro ao executar radar" });
   }
 });
 
 app.listen(3000, () => {
   console.log("Servidor rodando na porta 3000");
 });
 
EOF
)
