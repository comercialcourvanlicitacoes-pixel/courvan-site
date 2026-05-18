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

function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter(Boolean);
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
   FETCH RETRY
========================= */

async function fetchPncpComRetry(url, tentativas = 4) {
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "courvan-radar/1.0"
        }
      });

      const text = await response.text();

      if (!response.ok) {
        const erro = new Error(
          `PNCP HTTP ${response.status}`
        );

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

      if (
        tentativa === tentativas ||
        (!retryableHttp && !retryableNetwork)
      ) {
        break;
      }

      const esperaMs = 1500 * tentativa;

      console.log(
        `PNCP retry ${tentativa}/${tentativas} - aguardando ${esperaMs}ms`
      );

      await sleep(esperaMs);
    }
  }

  throw ultimoErro;
}

/* =========================
   MATCH MELHORADO
========================= */

function calcularMatch(segmentos, texto) {

  const textoTokens = tokenize(texto);

  let score = 0;

  for (const segmento of segmentos) {

    const segTokens = tokenize(segmento);

    if (!segTokens.length) continue;

    let matches = 0;

    for (const token of segTokens) {

      /* IGNORA PALAVRAS MUITO CURTAS */
      if (token.length < 3) continue;

      const encontrou =
        textoTokens.includes(token);

      if (encontrou) {
        matches++;
      }
    }

    if (matches > 0) {
      score += matches;
    }
  }

  return score;
}

/* =========================
   PRINCIPAL
========================= */

async function buscarLicitacoes() {

  const db = getDb();

  const hoje = new Date();

  const inicio = new Date(hoje);

  inicio.setUTCDate(
    inicio.getUTCDate() - 5
  );

  const dataInicial =
    formatPncpDate(inicio);

  const dataFinal =
    formatPncpDate(hoje);

  try {

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      "&codigoModalidadeContratacao=8" +
      "&pagina=1" +
      "&tamanhoPagina=50";

    const text =
      await fetchPncpComRetry(url, 4);

    let data;

    try {

      data = JSON.parse(text);

    } catch (e) {

      console.log("Resposta inválida PNCP:");
      console.log(text);

      throw new Error(
        "JSON inválido PNCP"
      );
    }

    const lista = data.data || [];

    console.log(
      "Total recebido:",
      lista.length
    );

    /* =========================
       CLIENTES
    ========================= */

    const clientesSnap =
      await db.collection("clientes").get();

    const clientes = [];

    clientesSnap.forEach(doc => {

      const raw =
        doc.data().segmentos;

      let segmentos = [];

      /* ARRAY */
      if (Array.isArray(raw)) {

        segmentos = raw;

      }
      /* STRING */
      else if (typeof raw === "string") {

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

    console.log(
      "Clientes carregados:",
      clientes.length
    );

    /* =========================
       LICITAÇÕES
    ========================= */

    const licitacoes = lista.map(item => {

      return {

        pncpId:
          item.numeroControlePNCP ||
          item.sequencialCompra ||
          Math.random().toString(36),

        orgao:
          item.orgaoEntidade?.razaoSocial || "",

        objeto:
          item.objetoCompra || "",

        cidade:
          item.unidadeOrgao?.municipioNome || "",

        estado:
          item.unidadeOrgao?.ufSigla || "",

        valor:
          item.valorTotalEstimado || 0,

        modalidade:
          item.modalidadeNome || "",

        abertura:
          item.dataAberturaProposta || "",

        encerramento:
          item.dataEncerramentoProposta || "",

        link:
          item.linkSistemaOrigem || ""
      };
    });

    console.log(
      "TOTAL LICITACOES PROCESSADAS:",
      licitacoes.length
    );

    /* =========================
       MATCH + INSERÇÃO
    ========================= */

    let totalInseridas = 0;

    for (const cliente of clientes) {

      if (!cliente.segmentos?.length) {
        continue;
      }

      console.log("\n======================");

      console.log(
        "CLIENTE:",
        cliente.id
      );

      console.log(
        "SEGMENTOS:",
        cliente.segmentos
      );

      for (const licitacao of licitacoes) {

        const textoCompleto = `
          ${licitacao.objeto}
          ${licitacao.orgao}
          ${licitacao.cidade}
          ${licitacao.estado}
          ${licitacao.modalidade}
        `;

        console.log(
          "\nPROCESSANDO LICITAÇÃO..."
        );

        console.log(
          "OBJETO:",
          licitacao.objeto
        );

        const score = calcularMatch(
          cliente.segmentos,
          textoCompleto
        );

        const match = score >= 2;

        console.log(
          "SCORE:",
          score
        );

        console.log(
          "MATCH:",
          match
        );

        if (!match) {
          continue;
        }

        console.log(
          "INSERINDO LICITAÇÃO..."
        );

        /* =========================
           ID FIXO
           EVITA DUPLICIDADE
        ========================= */

        const docId =
  `${cliente.id}_${licitacao.pncpId}`
    .trim()
    .toLowerCase()
    .replace(/[\/\\.#$\[\]]/g, "-");

        await db
          .collection("licitacoes")
          .doc(docId)
          .set({

            clienteId: cliente.id,

            ...licitacao,

            score,

            segmentosMatch:
              cliente.segmentos,

            status: "aviso",

            dataCriacao:
              admin.firestore
                .FieldValue
                .serverTimestamp()

          }, {
            merge: true
          });

        totalInseridas++;
      }
    }

    const message =
      `Radar finalizado. Inseridas: ${totalInseridas}. ` +
      `Intervalo: ${dataInicial} a ${dataFinal}.`;

    console.log("\n" + message);

    return {

      ok: true,

      totalRecebidasPncp:
        lista.length,

      totalClientes:
        clientes.length,

      totalInseridas,

      dataInicial,

      dataFinal,

      message
    };

  } catch (error) {

    if (error?.status) {

      console.log(
        "Erro HTTP PNCP:",
        error.status
      );
    }

    if (error?.responseText) {

      console.log(
        "Resposta:",
        error.responseText
      );
    }

    console.log(
      "ERRO:",
      error
    );

    throw error;
  }
}

module.exports = {
  buscarLicitacoes
};

if (require.main === module) {

  buscarLicitacoes()

    .then(result => {

      console.log(
        "Execução concluída:",
        result
      );

      process.exit(0);
    })

    .catch(error => {

      console.log(error);

      process.exit(1);
    });
}
