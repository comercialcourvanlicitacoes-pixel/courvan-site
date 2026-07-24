import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createRequire } from "module";
import admin from "firebase-admin";
import { GoogleGenAI } from "@google/genai";

const require = createRequire(import.meta.url);
const app = express();
const PORT = 3000;

let firebaseAdminDb: any = null;

function getFirebaseAdminDb() {
  if (!firebaseAdminDb) {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountVar) {
      try {
        const serviceAccount = JSON.parse(serviceAccountVar);
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        }
        firebaseAdminDb = admin.firestore();
      } catch (err) {
        console.error("Error initializing Firebase Admin:", err);
      }
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT env var is not set.");
    }
  }
  return firebaseAdminDb;
}

function getGenAIClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY environment variable is not set.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware for parsing JSON and URL-encoded bodies (allowing large PDF base64 payloads)
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve content list for the blog index
app.get("/content/posts", (req, res) => {
  const postsPath = path.join(process.cwd(), "content", "posts");
  if (fs.existsSync(postsPath)) {
    fs.readdir(postsPath, (err, files) => {
      if (err) {
        res.status(500).send("Error reading posts directory");
        return;
      }
      // Return simple HTML list of files so the client DOMParser can parse it
      const links = files
        .filter(file => file.endsWith(".json"))
        .map(file => `<a href="/content/posts/${file}">${file}</a>`)
        .join("\n");
      res.send(`<html><body>${links}</body></html>`);
    });
  } else {
    res.send("<html><body></body></html>");
  }
});

// Serve individual posts statically if needed
app.use("/content/posts", express.static(path.join(process.cwd(), "content", "posts")));

// Endpoint to run the radar (trigger buscarLicitacoes from radar.js)
app.get("/api/run-radar", (req, res) => {
  console.log("Triggered radar execution via API...");
  exec("node radar.js", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      res.status(500).json({ success: false, error: error.message, stderr });
      return;
    }
    res.json({ success: true, stdout, stderr });
  });
});

// Dynamic iCalendar subscription feed for cloud calendars (Google, Outlook, etc.)
app.get("/api/feed/:clienteId", async (req, res) => {
  const { clienteId } = req.params;
  const dbAdmin = getFirebaseAdminDb();
  
  if (!dbAdmin) {
    res.status(500).send("Database not configured");
    return;
  }
  
  try {
    const isGeral = clienteId === "admin" || clienteId === "geral";
    
    // Fetch all clients to map their names and handle company grouping
    const todosClientesSnap = await dbAdmin.collection("clientes").get();
    const clientesMap: Record<string, string> = {};
    todosClientesSnap.forEach((docItem: any) => {
      clientesMap[docItem.id] = docItem.data()?.nome || "Desconhecido";
    });

    let clientIds = [clienteId];
    let clienteNome = isGeral ? "Geral Admin" : "Cliente";

    if (!isGeral) {
      const clienteDoc = await dbAdmin.collection("clientes").doc(clienteId).get();
      if (clienteDoc.exists) {
        const clienteData = clienteDoc.data();
        clienteNome = clienteData?.nome || "Cliente";
        const nomeEmpresa = (clienteData?.empresa || "").trim();
        if (nomeEmpresa) {
          const docsMesmaEmpresa = todosClientesSnap.docs.filter((d: any) => {
            const emp = (d.data().empresa || "").trim();
            return emp.toLowerCase() === nomeEmpresa.toLowerCase();
          });
          if (docsMesmaEmpresa.length > 0) {
            clientIds = docsMesmaEmpresa.map((d: any) => d.id);
            clienteNome = nomeEmpresa;
          }
        }
      }
    }

    // Query active licitacoes
    let licQuery: any = dbAdmin.collection("licitacoes");
    if (!isGeral) {
      if (clientIds.length === 1) {
        licQuery = licQuery.where("clienteId", "==", clientIds[0]);
      } else {
        licQuery = licQuery.where("clienteId", "in", clientIds);
      }
    }
    licQuery = licQuery.where("status", "in", ["aviso", "andamento", "vencida", "perdida"]);
    const licSnap = await licQuery.get();
      
    // Query documentos
    let docQuery: any = dbAdmin.collection("documentos");
    if (!isGeral) {
      if (clientIds.length === 1) {
        docQuery = docQuery.where("clienteId", "==", clientIds[0]);
      } else {
        docQuery = docQuery.where("clienteId", "in", clientIds);
      }
    }
    const docSnap = await docQuery.get();
      
    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Courvan//Courvan Agenda//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Courvan - " + clienteNome + "\r\nX-WR-TIMEZONE:America/Sao_Paulo\r\nX-PUBLISHED-TTL:PT15M\r\nREFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n";
    
    // Process licitacoes
    licSnap.forEach((docItem: any) => {
      const l = docItem.data();
      if (!l.dataSessao) return;
      
      const uid = docItem.id + "@courvan.com.br";
      const eventClienteNome = clientesMap[l.clienteId] || clienteNome;
      const summary = `Licitação: ${l.orgao || "Órgão"}`;
      const description = `Objeto: ${l.objeto || ""}\\nValor: ${l.valor || ""}\\nStatus: ${l.status || ""}\\nCliente: ${eventClienteNome}`;
      
      let dateStr = l.dataSessao;
      let ymd = "";
      if (dateStr.includes("/")) {
        ymd = dateStr.split("/").reverse().join("");
      } else {
        ymd = dateStr.replace(/-/g, "").substring(0, 8);
      }
      
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:${uid}\r\n`;
      icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\n`;
      icsContent += `DTSTART;VALUE=DATE:${ymd}\r\n`;
      icsContent += `SUMMARY:${summary.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += `DESCRIPTION:${description.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += "END:VEVENT\r\n";
    });
    
    // Process documentos
    docSnap.forEach((docItem: any) => {
      const d = docItem.data();
      if (!d.vencimento) return;
      
      const uid = docItem.id + "@courvan.com.br";
      const eventClienteNome = clientesMap[d.clienteId] || clienteNome;
      const summary = `📄 Vencimento: ${d.nome || "Documento"}`;
      const description = `Categoria: ${d.categoria || ""}\\nStatus do Documento: ${d.statusDocumento || ""}\\nCliente: ${eventClienteNome}`;
      
      let dateStr = d.vencimento; // Expecting YYYY-MM-DD
      const ymd = dateStr.replace(/-/g, "").substring(0, 8);
      
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:${uid}\r\n`;
      icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\n`;
      icsContent += `DTSTART;VALUE=DATE:${ymd}\r\n`;
      icsContent += `SUMMARY:${summary.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += `DESCRIPTION:${description.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += "END:VEVENT\r\n";
    });
    
    icsContent += "END:VCALENDAR\r\n";
    
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Disposition", `inline; filename="agenda_${clienteId}.ics"`);
    res.status(200).send(icsContent);
  } catch (error: any) {
    console.error("Error generating ICS feed:", error);
    res.status(500).send("Error generating calendar feed");
  }
});

// ============================================================================
// ROTAS DE AGENTE DE IA (ANÁLISE DE EDITAL, MAPEAMENTO E CHAT CONSULTIVO)
// ============================================================================

app.post("/api/ai/analisar-edital", async (req, res) => {
  try {
    const { text, fileData, mimeType, link, clienteNome, licitacaoObjeto, clienteId } = req.body;
    
    if (!text && !fileData && !link) {
      res.status(400).json({ error: "Forneça o texto, arquivo PDF/DOCX ou link do edital para análise." });
      return;
    }

    const ai = getGenAIClient();
    
    const promptSystem = `Você é o Agente de IA Especialista Sênior da Courvan Assessoria em Licitações e Contratos Públicos (especialista na Nova Lei de Licitações - Lei 14.133/21, Lei 8.666/93, Lei 10.520/02 e regramentos de compras públicas do Brasil).

Sua missão é realizar uma LEITURA TÉCNICA E CRÍTICA COMPLETA do Edital a seguir, identificando e detalhando rigorosamente TODAS as exigências para o licitante e fornecendo pareceres e sugestões estratégicas para garantir a vitória do cliente com total segurança jurídica.

Por favor, analise as informações/documentos fornecidos e formate seu relatório em MARKDOWN rico, elegante, didático e ultra organizado com os seguintes tópicos obrigatórios:

### 🏛️ 1. RESUMO EXECUTIVO DO CERTAME
- **Órgão Licitante:** (Nome completo da Prefeitura, Câmara, Secretaria ou Autarquia)
- **Número do Edital / Processo:** (Ex: Pregão Eletrônico nº 12/2026 - Proc. 458/2026)
- **Modalidade & Critério de Julgamento:** (Ex: Pregão Eletrônico por Menor Preço Por Item / Lote / Global)
- **Objeto da Contratação:** (Descrição clara e abrangente do objeto)
- **Valor Estimado / Módulo:** (Valor total estimado ou indicação se é valor sigiloso)
- **Portal / Sistema da Disputa:** (Ex: Compras.gov.br, LicitaNET, BNC, Bolsa de Licitações)
- **Data e Horário da Sessão Pública:** (Data exata, dia da semana e horário)

---

### 📋 2. MAPEAMENTO COMPLETO DE EXIGÊNCIAS PARA O LICITANTE (CHECKLIST DE HABILITAÇÃO)

#### ⚖️ Habilitação Jurídica:
- Cartão CNPJ atualizado com CNAE compatível com o objeto licitado.
- Contrato Social / Estatuto Social consolidado e registrado.
- Certidão Simplificada da Junta Comercial (dentro do prazo de validade).
- Documentos dos Sócios e Administradores (RG/CPF ou CNH).
- Declarações Obrigatórias do Edital (Art. 7º XXXIII CF, Inexistência de fatos impeditivos, Elaboração independente de proposta, Enquadramento ME/EPP se aplicável).

#### 🏛️ Regularidade Fiscal, Social e Trabalhista:
- **CND Federal / INSS:** Certidão Conjunta Negativa de Débitos Relativos a Tributos Federais e à Dívida Ativa da União.
- **CND Estadual:** Certidão Negativa de Débitos Tributários Estaduais.
- **CND Municipal:** Certidão Negativa de Débitos Tributários Municipais da sede do licitante.
- **CRF FGTS:** Certificado de Regularidade do FGTS.
- **CNDT:** Certidão Negativa de Débitos Trabalhistas.

#### 🛠️ Qualificação Técnica:
- **Atestado(s) de Capacidade Técnica:** (Detalhamento do que é exigido: se exige quantitativo mínimo exato %, se exige parcelas de maior relevância técnica, se exige registro ou atestado em nome da empresa ou do profissional responsável).
- **Registro em Conselho Profissional:** (Se há exigência de registro no CREA, CRA, CAU, OAB, CRF, CRM, etc., para a empresa e/ou para o responsável técnico).
- **Vistoria Técnica / Declaratório de Visita:** (Indique se a vistoria é **Obrigatória** ou **Facultativa**, qual o prazo limite e se pode ser substituída por Declaração Formal de Conhecimento das Condições do Local).
- **Equipe Técnica Mínima / Responsável Técnico:** (Exigências relativas a profissionais habilitados).

#### 📈 Qualificação Econômico-Financeira:
- **Balanço Patrimonial e DRE:** Exigência do último exercício social registrado na Junta Comercial ou com recibo do SPED/ECD.
- **Índices Financeiros Mínimos:** (Detalhamento dos índices exatos exigidos: Liquidez Geral LG, Liquidez Corrente LC e Solvência Geral SG - ex: LG ≥ 1,0; LC ≥ 1,0; SG ≥ 1,0).
- **Capital Social Mínimo ou Patrimônio Líquido Mínimo:** (% sobre o valor estimado da contratação, ex: 10% para licitantes que não atingirem os índices).
- **Certidão Negativa de Falência, Concordata e Recuperação Judicial/Extrajudicial:** Emitida pelo distribuidor da sede da licitante.

---

### ⏱️ 3. CRONOGRAMA & PRAZOS CRÍTICOS DA LICITAÇÃO
- **Prazo Limite para Pedido de Esclarecimento:** (Data e horário limite legal).
- **Prazo Limite para Impugnação ao Edital:** (Data e horário limite legal).
- **Data e Horário da Disputa de Lances:** (Data e hora do certame).
- **Prazo para Envio da Proposta Readequada & Documentos Complementares:** (Prazo pós-disputa concedido pelo pregoeiro).

---

### ⚠️ 4. ANÁLISE DE RISCOS, CLÁUSULAS RESTRITIVAS E PONTOS DE ATENÇÃO
- **Exigências Abusivas ou Direcionadas:** (Análise crítica de cláusulas ilícitas ou restritivas à ampla competitividade).
- **Exigências de Amostras, Catálogos ou Laudos:** (Atenção para exigências prévias ou regras de amostragem).
- **Prazos de Entrega / Execução Contratual:** (Viabilidade operacional e prazos).
- **Regras de Multas e Penalidades Contratuais:** (Percentuais e sanções aplicáveis).

---

### 💡 5. SUGESTÕES ESTRATÉGICAS COURVAN & RECOMENDAÇÕES PRÁTICAS
- **Recomendação Final de Participação:** (**RECOMENDADO**, **RECOMENDADO COM RESSALVAS** ou **NECESSITA DE IMPUGNAÇÃO**).
- **Fundamentação para Impugnação / Esclarecimento:** (Principais teses legais para contestação formal).
- **Checklist de Ação Imediata para o Licitante:** (Lista passo a passo das providências urgentes que a empresa deve adotar).

Cliente Solicitante: ${clienteNome || "Cliente Courvan"}
${licitacaoObjeto ? `Objeto Informado: ${licitacaoObjeto}` : ""}
${link ? `Link do Edital: ${link}` : ""}
`;

    const contents: any[] = [];
    if (fileData) {
      const cleanBase64 = fileData.replace(/^data:[^;]+;base64,/, "");
      contents.push({
        inlineData: {
          data: cleanBase64,
          mimeType: mimeType || "application/pdf"
        }
      });
    }
    
    let promptFinal = promptSystem;
    if (text) {
      promptFinal += `\n\n--- TEXTO / TRECHO DO EDITAL FORNECIDO ---\n${text}`;
    }
    contents.push(promptFinal);

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents.length === 1 ? contents[0] : { parts: contents }
    });

    const resultadoTexto = response.text || "Não foi possível extrair a análise do edital.";

    // Save to Firestore if database is available
    const dbAdmin = getFirebaseAdminDb();
    let analiseId = "";
    if (dbAdmin) {
      try {
        const docRef = await dbAdmin.collection("analises_editais").add({
          clienteId: clienteId || "geral",
          clienteNome: clienteNome || "Cliente",
          licitacaoObjeto: licitacaoObjeto || "Análise de Edital",
          dataAnalise: new Date().toISOString(),
          resultadoMarkdown: resultadoTexto,
          historicoChat: []
        });
        analiseId = docRef.id;
      } catch (e) {
        console.error("Erro ao salvar análise no Firestore:", e);
      }
    }

    res.json({ success: true, resultado: resultadoTexto, analiseId });
  } catch (error: any) {
    console.error("Erro no endpoint /api/ai/analisar-edital:", error);
    res.status(500).json({ success: false, error: error.message || "Erro interno ao analisar edital com IA." });
  }
});

app.post("/api/ai/perguntar-edital", async (req, res) => {
  try {
    const { editalContext, pergunta, historico, analiseId } = req.body;
    if (!pergunta) {
      res.status(400).json({ error: "Pergunta não fornecida." });
      return;
    }

    const ai = getGenAIClient();
    
    const systemInstruction = `Você é o Agente de IA Consultor da Courvan Assessoria em Licitações e Compras Públicas.
Sua missão é responder de forma direta, precisa, esclarecedora e juridicamente fundamentada (com base na Nova Lei de Licitações 14.133/21 e jurisprudência dos Tribunais de Contas) a qualquer questionamento do cliente referente ao Edital que foi analisado.

Contexto da Análise do Edital:
${editalContext || "Análise de Edital de Licitação Pública"}

Diretrizes de Atendimento:
- Responda objetivamente à dúvida do cliente.
- Cite as exigências do edital ou os dispositivos legais cabíveis de maneira clara e fácil de entender.
- Forneça orientação prática sobre o que a empresa deve fazer.
- Mantenha a identidade profissional e prestativa da Courvan Assessoria.`;

    const chat = ai.chats.create({
      model: "gemini-3.6-flash",
      config: {
        systemInstruction
      }
    });

    if (Array.isArray(historico)) {
      for (const msg of historico) {
        if (msg.role === "user" && msg.content) {
          await chat.sendMessage({ message: msg.content });
        }
      }
    }

    const response = await chat.sendMessage({ message: pergunta });
    const respostaTexto = response.text || "Não foi possível gerar uma resposta para o questionamento.";

    // Save chat interaction to Firestore if analiseId is provided
    const dbAdmin = getFirebaseAdminDb();
    if (dbAdmin && analiseId) {
      try {
        const analiseRef = dbAdmin.collection("analises_editais").doc(analiseId);
        const snap = await analiseRef.get();
        if (snap.exists) {
          const currentHist = snap.data().historicoChat || [];
          currentHist.push({ role: "user", content: pergunta, timestamp: new Date().toISOString() });
          currentHist.push({ role: "assistant", content: respostaTexto, timestamp: new Date().toISOString() });
          await analiseRef.update({ historicoChat: currentHist });
        }
      } catch (e) {
        console.error("Erro ao salvar chat no Firestore:", e);
      }
    }

    res.json({ success: true, resposta: respostaTexto });
  } catch (error: any) {
    console.error("Erro no endpoint /api/ai/perguntar-edital:", error);
    res.status(500).json({ success: false, error: error.message || "Erro ao responder pergunta do edital." });
  }
});

app.get("/api/ai/historico-analises/:clienteId", async (req, res) => {
  try {
    const { clienteId } = req.params;
    const dbAdmin = getFirebaseAdminDb();
    if (!dbAdmin) {
      res.status(500).json({ error: "Banco de dados não configurado" });
      return;
    }
    let query: any = dbAdmin.collection("analises_editais");
    if (clienteId !== "admin" && clienteId !== "geral") {
      query = query.where("clienteId", "==", clienteId);
    }
    const snap = await query.orderBy("dataAnalise", "desc").limit(15).get();
    
    const analises: any[] = [];
    snap.forEach((doc: any) => {
      analises.push({ id: doc.id, ...doc.data() });
    });
    res.json({ success: true, analises });
  } catch (error: any) {
    console.error("Erro ao buscar histórico de análises:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve static files
const publicDir = process.env.NODE_ENV === "production" 
  ? path.join(process.cwd(), "dist")
  : process.cwd();

// Serve assets, admin, blog, etc.
app.use(express.static(publicDir));

// Fallback to index.html for root path or HTML-expecting requests
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
});
