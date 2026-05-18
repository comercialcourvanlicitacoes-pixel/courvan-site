const admin = require("firebase-admin");

let initialized = false;

function getDb() {
  if (!initialized) {
    const serviceAccount = JSON.parse(
      process.env.FIREBASE_SERVICE_ACCOUNT
    );

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    initialized = true;
  }

  return admin.firestore();
}

/* =========================
   NORMALIZAÇÃO
========================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   TOKENIZAÇÃO
========================= */

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
}

/* =========================
   STOPWORDS
========================= */

const STOPWORDS = [
  "de","da","do","das","dos","para","com","sem","por","em",
  "na","no","nas","nos","a","o","as","os","e","ou","ao","aos",
  "à","às","um","uma","uns","umas","servico","servicos",
  "contratacao","aquisicao","empresa","material","prestacao","fornecimento"
];

/* =========================
   STEM
========================= */

function stem(token) {
  let t = normalize(token);

  const finais = ["coes","cao","s","es","is","ns"];

  for (const fim of finais) {
    if (t.endsWith(fim) && t.length > fim.length + 3) {
      t = t.slice(0, -fim.length);
      break;
    }
  }

  return t;
}

/* =========================
   TOKENIZAÇÃO INTELIGENTE
========================= */

function tokenizeSmart(text) {
  return tokenize(text)
    .map(stem)
    .filter(token => {
      if (!token) return false;
      if (token.length < 3) return false;
      if (STOPWORDS.includes(token)) return false;
      return true;
    });
}

/* =========================
   DATA PNCP
========================= */

function formatPncpDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/* =========================
   RETRY MELHORADO
========================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchPncpComRetry(url, tentativas = 4) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "courvan-radar/4.0"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        const erro = new Error(`PNCP HTTP ${response.status}`);
        erro.status = response.status;
        erro.responseText = text;
        throw erro;
      }

      return text;

    } catch (error) {
      ultimoErro = error;

      const status = error?.status;

      const retryableHttp =
        [429, 500, 502, 503, 504].includes(status);

      const retryableNetwork =
        error?.name === "TypeError" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ETIMEDOUT";

      if (tentativa === tentativas || (!retryableHttp && !retryableNetwork)) {
        break;
      }

      const esperaMs = Math.min(10000 * tentativa, 60000);

      console.log(`Retry PNCP ${tentativa}/${tentativas} (${status || "NET"})`);

      await sleep(esperaMs);
    }
  }

  // 🔥 NÃO QUEBRA O RADAR
  console.log("PNCP falhou, retornando vazio parcial...");
  return null;
}

/* =========================
   BUSCA PAGINADA SEGURA
========================= */

async function buscarTodasPaginasPncp(dataInicial, dataFinal) {
  let pagina = 1;
  let todas = [];

  while (true) {
    console.log(`Página ${pagina}`);

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      `&codigoModalidadeContratacao=8` +
      `&pagina=${pagina}` +
      `&tamanhoPagina=50`;

    const text = await fetchPncpComRetry(url);

    // 🔥 se PNCP caiu, não quebra
    if (!text) {
      console.log("PNCP indisponível nesta página. Encerrando paginação.");
      break;
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      console.log("JSON inválido PNCP, encerrando paginação");
      break;
    }

    if (!data || !Array.isArray(data.data)) {
      console.log("Resposta inesperada PNCP");
      break;
    }

    const lista = data.data;

    if (!lista.length) break;

    todas.push(...lista);

    if (lista.length < 50) break;

    // 🔥 segurança contra loop infinito
    if (pagina >= 20) {
      console.log("Limite de páginas atingido (segurança)");
      break;
    }

    pagina++;
  }

  return todas;
}

/* =========================
   MATCH
========================= */

function calcularMatch(segmentos, textoTokens, textoNormalizado) {
  let score = 0;
  const detalhes = new Set();
  const textoSet = new Set(textoTokens);

  for (const segmento of segmentos) {
    const segTokens = tokenizeSmart(segmento);
    if (!segTokens.length) continue;

    let matches = 0;

    for (const token of segTokens) {
      if (textoSet.has(token)) {
        matches++;
        detalhes.add(token);
      }
    }

    if (textoNormalizado.includes(normalize(segmento))) {
      score += 10;
      detalhes.add(`EXATO:${segmento}`);
      continue;
    }

    if (matches > 0) score += matches * 3;
    if (matches === segTokens.length) score += 5;
  }

  return {
    score,
    detalhes: [...detalhes]
  };
}

/* =========================
   FILTROS
========================= */

function passarFiltros(cliente, licitacao) {
  if (Array.isArray(cliente.cidadesFiltro) && cliente.cidadesFiltro.length) {
    const cidades = cliente.cidadesFiltro.map(c => normalize(c));
    const cidade = normalize(licitacao.cidade);

    if (!cidades.some(c => cidade.includes(c))) return false;
  }

  if (Array.isArray(cliente.estadosFiltro) && cliente.estadosFiltro.length) {
    const estados = cliente.estadosFiltro.map(e => normalize(e));
    const estado = normalize(licitacao.estado);

    if (!estados.includes(estado)) return false;
  }

  if (Array.isArray(cliente.orgaosFiltro) && cliente.orgaosFiltro.length) {
    const orgaos = cliente.orgaosFiltro.map(o => normalize(o));
    const orgao = normalize(licitacao.orgao);

    if (!orgaos.some(o => orgao.includes(o))) return false;
  }

  return true;
}

/* =========================
   PRINCIPAL
========================= */

async function buscarLicitacoes() {
  const db = getDb();

  const hoje = new Date();
  const inicio = new Date(hoje);

  inicio.setUTCDate(inicio.getUTCDate() - 1);

  const dataInicial = formatPncpDate(inicio);
  const dataFinal = formatPncpDate(hoje);

  try {
    console.log("Iniciando radar...");

    const lista = await buscarTodasPaginasPncp(dataInicial, dataFinal);

    console.log("Licitações PNCP:", lista.length);

    const clientesSnap = await db.collection("clientes").get();

    const mapaTokens = new Map();
    const clientesMap = new Map();

    clientesSnap.forEach(doc => {
      const cliente = { id: doc.id, ...doc.data() };

      let segmentos = Array.isArray(cliente.segmentos)
        ? cliente.segmentos
        : String(cliente.segmentos || "").split(",");

      segmentos = segmentos.map(s => normalize(s)).filter(Boolean);

      cliente.segmentos = segmentos;

      clientesMap.set(cliente.id, cliente);

      const tokensUnicos = new Set();

      for (const s of segmentos) {
        for (const t of tokenizeSmart(s)) {
          tokensUnicos.add(t);
        }
      }

      for (const token of tokensUnicos) {
        if (!mapaTokens.has(token)) {
          mapaTokens.set(token, new Set());
        }
        mapaTokens.get(token).add(cliente.id);
      }
    });

    console.log("Clientes:", clientesMap.size);

    const promises = [];
    let totalInseridas = 0;

    for (const licitacao of lista.map(item => ({
      pncpId: item.numeroControlePNCP || Math.random().toString(36),
      orgao: item.orgaoEntidade?.razaoSocial || "",
      objeto: item.objetoCompra || "",
      cidade: item.unidadeOrgao?.municipioNome || "",
      estado: item.unidadeOrgao?.ufSigla || "",
      valor: item.valorTotalEstimado || 0,
      modalidade: item.modalidadeNome || ""
    }))) {

      const texto = normalize(`${licitacao.objeto} ${licitacao.orgao}`);

      const tokens = tokenizeSmart(texto);

      const candidatos = new Set();

      for (const t of tokens) {
        const set = mapaTokens.get(t);
        if (!set) continue;
        for (const id of set) candidatos.add(id);
      }

      for (const id of candidatos) {
        const cliente = clientesMap.get(id);
        if (!cliente) continue;

        if (!passarFiltros(cliente, licitacao)) continue;

        const result = calcularMatch(cliente.segmentos, tokens, texto);

        if (result.score < 6) continue;

        const docId = `${cliente.id}_${licitacao.pncpId}`
          .replace(/[\/\\.#$\[\]]/g, "-");

        promises.push(
          db.collection("licitacoes").doc(docId).set({
            clienteId: cliente.id,
            ...licitacao,
            matchScore: result.score,
            palavrasEncontradas: result.detalhes,
            segmentosMatch: cliente.segmentos,
            status: "aviso",
            dataCriacao: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true })
        );

        totalInseridas++;
      }
    }

    await Promise.all(promises);

    await db.collection("logsRadar").add({
      dataExecucao: admin.firestore.FieldValue.serverTimestamp(),
      totalRecebidasPncp: lista.length,
      totalClientes: clientesMap.size,
      totalInseridas,
      dataInicial,
      dataFinal
    });

    return {
      ok: true,
      totalInseridas,
      totalRecebidasPncp: lista.length
    };

  } catch (error) {
    console.log("ERRO:", error);
    throw error;
  }
}

module.exports = { buscarLicitacoes };

if (require.main === module) {
  buscarLicitacoes()
    .then(r => {
      console.log("OK:", r);
      process.exit(0);
    })
    .catch(e => {
      console.log(e);
      process.exit(1);
    });
}
