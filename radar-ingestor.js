const { MeiliSearch } = require("meilisearch");

const MEILI_HOST = "http://localhost:7700";
const MEILI_KEY = process.env.MEILI_MASTER_KEY || "123456";

const client = new MeiliSearch({
  host: MEILI_HOST,
  apiKey: MEILI_KEY
});

const index = client.index("licitacoes");

/* =========================
   UTIL
========================= */

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatPncpDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/* =========================
   FETCH PNCP (robusto)
========================= */

async function fetchPncp(url, retries = 3) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "courvan-ingestor/1.0"
        }
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      return await res.json();

    } catch (err) {
      console.log(`Retry PNCP ${i}/${retries}`);

      if (i === retries) throw err;

      await sleep(1500 * i);
    }
  }
}

/* =========================
   BUSCA PNCP (1 DIA)
========================= */

async function buscarPncpUltimoDia() {
  const hoje = new Date();
  const ontem = new Date();
  ontem.setUTCDate(hoje.getUTCDate() - 1);

  const dataInicial = formatPncpDate(ontem);
  const dataFinal = formatPncpDate(hoje);

  let pagina = 1;
  let todos = [];

  while (true) {
    console.log("Página", pagina);

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      `?dataInicial=${dataInicial}` +
      `&dataFinal=${dataFinal}` +
      `&pagina=${pagina}` +
      `&tamanhoPagina=50`;

    const data = await fetchPncp(url);

    const lista = data.data || [];

    if (!lista.length) break;

    todos.push(...lista);

    if (lista.length < 50) break;

    pagina++;
  }

  return todos;
}

/* =========================
   NORMALIZA LICITAÇÃO
========================= */

function mapLicitacao(item) {
  return {
    id: item.numeroControlePNCP || item.sequencialCompra,
    
    titulo: item.objetoCompra || "",
    orgao: item.orgaoEntidade?.razaoSocial || "",
    cidade: item.unidadeOrgao?.municipioNome || "",
    estado: item.unidadeOrgao?.ufSigla || "",
    modalidade: item.modalidadeNome || "",
    valor: item.valorTotalEstimado || 0,
    link: item.linkSistemaOrigem || "",

    textoBusca: `
      ${item.objetoCompra || ""}
      ${item.orgaoEntidade?.razaoSocial || ""}
      ${item.unidadeOrgao?.municipioNome || ""}
      ${item.unidadeOrgao?.ufSigla || ""}
      ${item.modalidadeNome || ""}
    `.toLowerCase()
  };
}

/* =========================
   MAIN
========================= */

async function run() {
  console.log("Iniciando ingestão PNCP → Meilisearch");

  const dados = await buscarPncpUltimoDia();

  console.log("Total PNCP:", dados.length);

  const documentos = dados.map(mapLicitacao);

  await index.addDocuments(documentos);

  console.log("Indexação concluída:", documentos.length);
}

run().catch(console.error);
