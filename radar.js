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
   STOPWORDS
========================= */

const STOPWORDS = [
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "com",
  "sem",
  "por",
  "em",
  "na",
  "no",
  "nas",
  "nos",
  "a",
  "o",
  "as",
  "os",
  "e",
  "ou",
  "ao",
  "aos",
  "à",
  "às",
  "um",
  "uma",
  "uns",
  "umas",
  "servico",
  "servicos",
  "contratacao",
  "aquisicao",
  "empresa",
  "material",
  "prestacao",
  "fornecimento"
];

/* =========================
   STEM SIMPLES
========================= */

function stem(token) {

  let t = normalize(token);

  const finais = [
    "coes",
    "cao",
    "s",
    "es",
    "is",
    "ns"
  ];

  for (const fim of finais) {

    if (
      t.endsWith(fim) &&
      t.length > fim.length + 3
    ) {

      t = t.slice(0, -fim.length);

      break;
    }
  }

  return t;
}

/* =========================
   TOKENIZAÇÃO AVANÇADA
========================= */

function tokenizeSmart(text) {

  return tokenize(text)
    .map(stem)
    .filter(token => {

      if (!token) return false;

      if (token.length < 3) return false;

      if (STOPWORDS.includes(token)) {
        return false;
      }

      return true;
    });
}

/* =========================
   DATA PNCP
========================= */

function formatPncpDate(date) {

  const y = date.getUTCFullYear();

  const m = String(
    date.getUTCMonth() + 1
  ).padStart(2, "0");

  const d = String(
    date.getUTCDate()
  ).padStart(2, "0");

  return `${y}${m}${d}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* =========================
   FETCH RETRY
========================= */

async function fetchPncpComRetry(
  url,
  tentativas = 4
) {

  let ultimoErro = null;

  for (
    let tentativa = 1;
    tentativa <= tentativas;
    tentativa++
  ) {

    try {

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "courvan-radar/2.0"
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
        [429, 500, 502, 503, 504]
          .includes(status);

      const retryableNetwork =
        error?.name === "TypeError" ||
        error?.code === "ECONNRESET" ||
        error?.code === "ETIMEDOUT";

      if (
        tentativa === tentativas ||
        (!retryableHttp &&
          !retryableNetwork)
      ) {
        break;
      }

      const esperaMs =
        1500 * tentativa;

      console.log(
        `PNCP retry ${tentativa}/${tentativas} - aguardando ${esperaMs}ms`
      );

      await sleep(esperaMs);
    }
  }

  throw ultimoErro;
}

/* =========================
   BUSCA PAGINADA PNCP
========================= */

async function buscarTodasPaginasPncp(
  dataInicial,
  dataFinal
) {

  let pagina = 1;

  let todas = [];

  while (true) {

    console.log(
      `Buscando página ${pagina}...`
    );

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      "&codigoModalidadeContratacao=8" +
      `&pagina=${pagina}` +
      "&tamanhoPagina=50";

    const text =
      await fetchPncpComRetry(url, 4);

    let data;

    try {

      data = JSON.parse(text);

    } catch (e) {

      console.log("JSON inválido PNCP");
      break;
    }

    const lista = data.data || [];

    console.log(
      `Página ${pagina}: ${lista.length} itens`
    );

    if (!lista.length) {
      break;
    }

    todas.push(...lista);

    if (lista.length < 50) {
      break;
    }

    pagina++;
  }

  return todas;
}

/* =========================
   MATCH INTELIGENTE
========================= */

function calcularMatch(
  segmentos,
  texto
) {

  const textoTokens =
    tokenizeSmart(texto);

  const textoSet =
    new Set(textoTokens);

  let score = 0;

  let detalhes = [];

  for (const segmento of segmentos) {

    const segTokens =
      tokenizeSmart(segmento);

    if (!segTokens.length) {
      continue;
    }

    let matches = 0;

    for (const token of segTokens) {

      if (textoSet.has(token)) {

        matches++;

        detalhes.push(token);
      }
    }

    /* MATCH EXATO */
    if (
      normalize(texto)
        .includes(normalize(segmento))
    ) {

      score += 10;

      detalhes.push(
        `EXATO:${segmento}`
      );

      continue;
    }

    /* MATCH PARCIAL */
    if (matches > 0) {

      score += matches * 3;
    }

    /* MATCH TOTAL SEGMENTO */
    if (
      matches === segTokens.length
    ) {

      score += 5;
    }
  }

  return {
    score,
    detalhes
  };
}

/* =========================
   FILTROS
========================= */

function passarFiltros(
  cliente,
  licitacao
) {

  /* =========================
     CIDADES
  ========================= */

  if (cliente.cidadesFiltro) {

    const cidades =
      cliente.cidadesFiltro
        .split(",")
        .map(c => normalize(c));

    const cidadeLicitacao =
      normalize(licitacao.cidade);

    const cidadeOk =
      cidades.some(c =>
        cidadeLicitacao.includes(c)
      );

    if (!cidadeOk) {
      return false;
    }
  }

  /* =========================
     ESTADOS
  ========================= */

  if (cliente.estadosFiltro) {

    const estados =
      cliente.estadosFiltro
        .split(",")
        .map(e => normalize(e));

    const estadoLicitacao =
      normalize(licitacao.estado);

    const estadoOk =
      estados.includes(
        estadoLicitacao
      );

    if (!estadoOk) {
      return false;
    }
  }

  /* =========================
     ÓRGÃOS
  ========================= */

  if (cliente.orgaosFiltro) {

    const orgaos =
      cliente.orgaosFiltro
        .split(",")
        .map(o => normalize(o));

    const orgaoLicitacao =
      normalize(licitacao.orgao);

    const orgaoOk =
      orgaos.some(o =>
        orgaoLicitacao.includes(o)
      );

    if (!orgaoOk) {
      return false;
    }
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

  inicio.setUTCDate(
    inicio.getUTCDate() - 5
  );

  const dataInicial =
    formatPncpDate(inicio);

  const dataFinal =
    formatPncpDate(hoje);

  try {

    console.log(
      "Iniciando busca PNCP..."
    );

    /* =========================
       BUSCA TODAS PÁGINAS
    ========================= */

    const lista =
      await buscarTodasPaginasPncp(
        dataInicial,
        dataFinal
      );

    console.log(
      "TOTAL RECEBIDO PNCP:",
      lista.length
    );

    /* =========================
       CLIENTES
    ========================= */

    const clientesSnap =
      await db
        .collection("clientes")
        .get();

    const clientes = [];

    clientesSnap.forEach(doc => {

      const raw =
        doc.data().segmentos;

      let segmentos = [];

      if (Array.isArray(raw)) {

        segmentos = raw;

      } else if (
        typeof raw === "string"
      ) {

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

    const licitacoes =
      lista.map(item => {

        return {

          pncpId:
            item.numeroControlePNCP ||
            item.sequencialCompra ||
            Math.random()
              .toString(36),

          orgao:
            item.orgaoEntidade
              ?.razaoSocial || "",

          objeto:
            item.objetoCompra || "",

          cidade:
            item.unidadeOrgao
              ?.municipioNome || "",

          estado:
            item.unidadeOrgao
              ?.ufSigla || "",

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
       MATCH
    ========================= */

    let totalInseridas = 0;

    const promises = [];

    for (const cliente of clientes) {

      if (
        !cliente.segmentos?.length
      ) {
        continue;
      }

      console.log(
        "\n======================"
      );

      console.log(
        "CLIENTE:",
        cliente.id
      );

      console.log(
        "SEGMENTOS:",
        cliente.segmentos
      );

      for (const licitacao of licitacoes) {

        const passouFiltros =
          passarFiltros(
            cliente,
            licitacao
          );

        if (!passouFiltros) {
          continue;
        }

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

        const resultado =
          calcularMatch(
            cliente.segmentos,
            textoCompleto
          );

        const score =
          resultado.score;

        const detalhes =
          resultado.detalhes;

        /* =========================
           LIMIAR MAIS INTELIGENTE
        ========================= */

        const match = score >= 3;

        console.log(
          "SCORE:",
          score
        );

        console.log(
          "MATCHES:",
          detalhes
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
        ========================= */

        const docId =
          `${cliente.id}_${licitacao.pncpId}`
            .trim()
            .toLowerCase()
            .replace(
              /[\/\\.#$\[\]]/g,
              "-"
            );

        const promise = db
  .collection("licitacoes")
  .doc(docId)
  .set({

    clienteId:
      cliente.id,

    ...licitacao,

    score,

    detalhesMatch:
      detalhes,

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

promises.push(promise);

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
