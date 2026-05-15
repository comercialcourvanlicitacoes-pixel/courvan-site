const admin = require("firebase-admin");

let initialized = false;

function getDb() {
  if (!initialized) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    initialized = true;
  }

  return admin.firestore();
}

/* =========================
   UTILITÁRIOS DE TEXTO
========================= */

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function tokenize(text) {
  return normalize(text)
    .split(/[^a-z0-9]+/g)
    .filter(t => t.length > 2);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================
   FETCH COM RETRY
========================= */

async function fetchPncpComRetry(url, tentativas = 4) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "courvan-radar/1.0"
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
      const retryableHttp = [429, 500, 502, 503, 504].includes(status);
      const retryableNetwork =
        error?.name === "TypeError" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ETIMEDOUT";

      if (tentativa === tentativas || (!retryableHttp && !retryableNetwork)) {
        break;
      }

      const esperaMs = 1500 * tentativa;
      console.log(`PNCP retry ${tentativa}/${tentativas} - aguardando ${esperaMs}ms`);
      await sleep(esperaMs);
    }
  }

  throw ultimoErro;
}

/* =========================
   BUSCA PRINCIPAL
========================= */

async function buscarLicitacoes() {
  const db = getDb();

  const hoje = new Date();
  const inicio = new Date(hoje);
  inicio.setUTCDate(inicio.getUTCDate() - 5);

  const dataInicial = formatPncpDate(inicio);
  const dataFinal = formatPncpDate(hoje);

  try {
    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      "&codigoModalidadeContratacao=8" +
      "&pagina=1" +
      "&tamanhoPagina=50";

    const text = await fetchPncpComRetry(url, 4);

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log("Resposta inválida PNCP:", text);
      throw new Error("JSON inválido PNCP");
    }

    const lista = data.data || [];
    console.log("Total recebido:", lista.length);

    /* =========================
       CLIENTES
    ========================= */

    const clientesSnap = await db.collection("clientes").get();

    const clientes = [];

    clientesSnap.forEach(doc => {
      const raw = doc.data().segmentos;

      let segmentos = [];

      if (Array.isArray(raw)) {
        segmentos = raw;
      } else if (typeof raw === "string") {
        segmentos = raw.split(",");
      }

      segmentos = segmentos
        .map(s => normalize(s))
        .filter(Boolean);

      clientes.push({
        id: doc.id,
        ...doc.data(),
        segmentos
      });
    });

    /* =========================
       LICITAÇÕES
    ========================= */

    const licitacoes = lista.map(item => {
      return {
        orgao: item.orgaoEntidade?.razaoSocial || "",
        objeto: item.objetoCompra || "",
        cidade: item.unidadeOrgao?.municipioNome || "",
        estado: item.unidadeOrgao?.ufSigla || "",
        valor: item.valorTotalEstimado || 0,
        modalidade: item.modalidadeNome || "",
        abertura: item.dataAberturaProposta || "",
        encerramento: item.dataEncerramentoProposta || "",
        link: item.linkSistemaOrigem || ""
      };
    });

    /* =========================
       MATCH INTELIGENTE
    ========================= */

    let totalInseridas = 0;

    for (const cliente of clientes) {
      if (!cliente.segmentos?.length) continue;

      const segmentos = cliente.segmentos;

      console.log("\nCLIENTE:", cliente.id);
      console.log("SEGMENTOS:", segmentos);

      for (const licitacao of licitacoes) {
        const texto = normalize(`${licitacao.objeto} ${licitacao.orgao}`);

        const tokensTexto = tokenize(texto);

        let score = 0;

        for (const seg of segmentos) {
          const segTokens = tokenize(seg);

          const matchParcial = segTokens.some(token =>
            tokensTexto.includes(token)
          );

          if (matchParcial) score++;
        }

        const match = score > 0;

        if (!match) continue;

        const existe = await db
          .collection("licitacoes")
          .where("clienteId", "==", cliente.id)
          .where("link", "==", licitacao.link)
          .limit(1)
          .get();

        if (!existe.empty) continue;

        await db.collection("licitacoes").add({
          clienteId: cliente.id,
          ...licitacao,
          score,
          status: "aviso",
          dataCriacao: admin.firestore.FieldValue.serverTimestamp()
        });

        totalInseridas++;
      }
    }

    const message = `Radar finalizado. Inseridas: ${totalInseridas}. Intervalo: ${dataInicial} a ${dataFinal}.`;

    console.log("\n" + message);

    return {
      ok: true,
      totalRecebidasPncp: lista.length,
      totalClientes: clientes.length,
      totalInseridas,
      dataInicial,
      dataFinal,
      message
    };

  } catch (error) {
    if (error?.status) {
      console.log("Erro HTTP PNCP:", error.status);
    }

    if (error?.responseText) {
      console.log("Resposta:", error.responseText);
    }

    console.log("ERRO:", error);
    throw error;
  }
}

module.exports = { buscarLicitacoes };

if (require.main === module) {
  buscarLicitacoes()
    .then(result => {
      console.log("Execução concluída:", result);
      process.exit(0);
    })
    .catch(() => process.exit(1));
}
