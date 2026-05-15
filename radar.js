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

function formatPncpDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

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

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      console.log("Erro HTTP PNCP:", response.status);
      console.log("Resposta:", text);
      throw new Error(`PNCP HTTP ${response.status}`);
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log("PNCP retornou algo inválido:");
      console.log(text);
      throw new Error("Resposta PNCP inválida");
    }

    const lista = data.data || [];

    console.log("Total recebido:", lista.length);

    const clientesSnap = await db.collection("clientes").get();
    const clientes = [];

    clientesSnap.forEach(doc => {
      const rawSegmentos = doc.data().segmentos || [];

      const segmentos = Array.isArray(rawSegmentos)
        ? rawSegmentos.map(s => String(s).trim().toLowerCase()).filter(Boolean)
        : String(rawSegmentos)
            .split(",")
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);

      clientes.push({
        id: doc.id,
        ...doc.data(),
        segmentos
      });
    });

    const licitacoes = lista.map(item => {
      const objetoTexto = item.objetoCompra || "";

      return {
        orgao: item.orgaoEntidade?.razaoSocial || "Não informado",
        cidade: item.unidadeOrgao?.municipioNome || "Não informado",
        estado: item.unidadeOrgao?.ufSigla || "Não informado",
        objeto: objetoTexto,
        valor: item.valorTotalEstimado || 0,
        modalidade: item.modalidadeNome || "Não informado",
        abertura: item.dataAberturaProposta || "Não informado",
        encerramento: item.dataEncerramentoProposta || "Não informado",
        link: item.linkSistemaOrigem || "Sem link"
      };
    });

    let totalInseridas = 0;

    for (const cliente of clientes) {
      if (!cliente.segmentos || cliente.segmentos.length === 0) continue;

      for (const licitacao of licitacoes) {
        const texto = `${licitacao.objeto} ${licitacao.orgao}`.toLowerCase();

        const match = cliente.segmentos.some(seg => texto.includes(seg));
        if (!match) continue;

        const existe = await db
          .collection("licitacoes")
          .where("clienteId", "==", cliente.id)
          .where("objeto", "==", licitacao.objeto)
          .limit(1)
          .get();

        if (!existe.empty) continue;

        await db.collection("licitacoes").add({
          clienteId: cliente.id,
          ...licitacao,
          status: "aviso",
          dataCriacao: admin.firestore.FieldValue.serverTimestamp()
        });

        totalInseridas += 1;
      }
    }

    const message = `Radar finalizado. Inseridas: ${totalInseridas}. Intervalo: ${dataInicial} a ${dataFinal}.`;
    console.log(message);

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
    console.log("ERRO:", error);
    throw error;
  }
}

module.exports = { buscarLicitacoes };

if (require.main === module) {
  buscarLicitacoes()
    .then(result => {
      console.log("Execução direta concluída:", result);
      process.exit(0);
    })
    .catch(() => process.exit(1));
}
