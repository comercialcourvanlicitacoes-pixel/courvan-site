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
   STEM
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
   TOKENIZAÇÃO INTELIGENTE
========================= */

function tokenizeSmart(text) {

  return tokenize(text)
    .map(stem)
    .filter(token => {

      if (!token) return false;

      if (token.length < 3) {
        return false;
      }

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

/* =========================
   RETRY
========================= */

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
          "User-Agent": "courvan-radar/4.0"
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
        `Retry PNCP ${tentativa}/${tentativas}`
      );

      await sleep(esperaMs);
    }
  }

  throw ultimoErro;
}

/* =========================
   BUSCA PAGINADA
========================= */

async function buscarTodasPaginasPncp(
  dataInicial,
  dataFinal
) {

  let pagina = 1;

  let todas = [];

  while (true) {

    console.log(
      `Página ${pagina}`
    );

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      `&pagina=${pagina}` +
      "&tamanhoPagina=50";

    const text =
      await fetchPncpComRetry(url);

    let data;

    try {

      data = JSON.parse(text);

    } catch {

      break;
    }

    const lista = data.data || [];

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
   MATCH
========================= */

function calcularMatch(
  segmentos,
  textoTokens,
  textoNormalizado
) {

  let score = 0;

  const detalhes = new Set();

  const textoSet =
    new Set(textoTokens);

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

        detalhes.add(token);
      }
    }

    /* MATCH EXATO */

    if (
      textoNormalizado.includes(
        normalize(segmento)
      )
    ) {

      score += 10;

      detalhes.add(
        `EXATO:${segmento}`
      );

      continue;
    }

    /* MATCH PARCIAL */

    if (matches > 0) {

      score += matches * 3;
    }

    /* MATCH TOTAL */

    if (
      matches === segTokens.length
    ) {

      score += 5;
    }
  }

  return {
    score,
    detalhes: [...detalhes]
  };
}

/* =========================
   FILTROS
========================= */

function passarFiltros(
  cliente,
  licitacao
) {

  /* CIDADES */

  if (
    Array.isArray(cliente.cidadesFiltro) &&
    cliente.cidadesFiltro.length
  ) {

    const cidades =
      cliente.cidadesFiltro
        .map(c => normalize(c));

    const cidade =
      normalize(licitacao.cidade);

    const ok =
      cidades.some(c =>
        cidade.includes(c)
      );

    if (!ok) {
      return false;
    }
  }

  /* ESTADOS */

  if (
    Array.isArray(cliente.estadosFiltro) &&
    cliente.estadosFiltro.length
  ) {

    const estados =
      cliente.estadosFiltro
        .map(e => normalize(e));

    const estado =
      normalize(licitacao.estado);

    if (
      !estados.includes(estado)
    ) {
      return false;
    }
  }

  /* ÓRGÃOS */

  if (
    Array.isArray(cliente.orgaosFiltro) &&
    cliente.orgaosFiltro.length
  ) {

    const orgaos =
      cliente.orgaosFiltro
        .map(o => normalize(o));

    const orgao =
      normalize(licitacao.orgao);

    const ok =
      orgaos.some(o =>
        orgao.includes(o)
      );

    if (!ok) {
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
      "Iniciando radar..."
    );

    /* =========================
       PNCP
    ========================= */

    const lista =
      await buscarTodasPaginasPncp(
        dataInicial,
        dataFinal
      );

    console.log(
      "Licitações PNCP:",
      lista.length
    );

    /* =========================
       CLIENTES
    ========================= */

    const clientesSnap =
      await db
        .collection("clientes")
        .get();

    const mapaTokens =
      new Map();

    const clientesMap =
      new Map();

    clientesSnap.forEach(doc => {

      const cliente = {
        id: doc.id,
        ...doc.data()
      };

      let segmentos = [];

      const raw =
        cliente.segmentos;

      if (Array.isArray(raw)) {

        segmentos = raw;

      } else if (
        typeof raw === "string"
      ) {

        segmentos =
          raw.split(",");
      }

      segmentos = segmentos
        .map(s => normalize(s))
        .filter(Boolean);

      cliente.segmentos =
        segmentos;

      clientesMap.set(
        cliente.id,
        cliente
      );

      /* INDEXAÇÃO */

      const tokensUnicos =
        new Set();

      for (const segmento of segmentos) {

        const tokens =
          tokenizeSmart(segmento);

        for (const token of tokens) {

          tokensUnicos.add(token);
        }
      }

      for (const token of tokensUnicos) {

        if (
          !mapaTokens.has(token)
        ) {

          mapaTokens.set(
            token,
            new Set()
          );
        }

        mapaTokens
          .get(token)
          .add(cliente.id);
      }
    });

    console.log(
      "Clientes:",
      clientesMap.size
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
      "Processando matches..."
    );

    let totalInseridas = 0;

    const promises = [];

    /* =========================
       LOOP PRINCIPAL
    ========================= */

    for (const licitacao of licitacoes) {

      const textoCompleto = `
        ${licitacao.objeto}
        ${licitacao.orgao}
        ${licitacao.cidade}
        ${licitacao.estado}
        ${licitacao.modalidade}
      `;

      const textoNormalizado =
        normalize(textoCompleto);

      const tokensLicitacao =
        tokenizeSmart(textoCompleto);

      /* =========================
         CLIENTES RELEVANTES
      ========================= */

      const clientesRelevantes =
        new Set();

      for (const token of tokensLicitacao) {

        const clientesToken =
          mapaTokens.get(token);

        if (!clientesToken) {
          continue;
        }

        for (const clienteId of clientesToken) {

          clientesRelevantes.add(
            clienteId
          );
        }
      }

      /* =========================
         ANALISA SOMENTE RELEVANTES
      ========================= */

      for (const clienteId of clientesRelevantes) {

        const cliente =
          clientesMap.get(clienteId);

        if (!cliente) {
          continue;
        }

        const passouFiltros =
          passarFiltros(
            cliente,
            licitacao
          );

        if (!passouFiltros) {
          continue;
        }

        const resultado =
          calcularMatch(
            cliente.segmentos,
            tokensLicitacao,
            textoNormalizado
          );

        const score =
          resultado.score;

        /* SCORE MÍNIMO */

        if (score < 6) {
          continue;
        }

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

            matchScore:
              score,

            palavrasEncontradas:
              resultado.detalhes,

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

    console.log(
      "Gravando Firestore..."
    );

    await Promise.all(promises);

    /* =========================
       LOG RADAR
    ========================= */

    await db
      .collection("logsRadar")
      .add({

        dataExecucao:
          admin.firestore
            .FieldValue
            .serverTimestamp(),

        totalRecebidasPncp:
          lista.length,

        totalClientes:
          clientesMap.size,

        totalInseridas,

        dataInicial,

        dataFinal
      });

    const message =
      `Radar finalizado. Inseridas: ${totalInseridas}`;

    console.log(message);

    return {

      ok: true,

      totalRecebidasPncp:
        lista.length,

      totalClientes:
        clientesMap.size,

      totalInseridas,

      dataInicial,

      dataFinal,

      message
    };

  } catch (error) {

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
