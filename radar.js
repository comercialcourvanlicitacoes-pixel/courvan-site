const admin = require("firebase-admin");

// =============================
// FIREBASE INIT (via GitHub Secret)
// =============================
const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// =============================
// FUNÇÃO PRINCIPAL
// =============================
async function buscarLicitacoes() {

  try {

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260510" +
      "&dataFinal=20260514" +
      "&codigoModalidadeContratacao=8" +
      "&pagina=1" +
      "&tamanhoPagina=50";

    const response = await fetch(url);

    const text = await response.text();

    if (!response.ok) {
      console.log("Erro HTTP PNCP:", response.status);
      console.log("Resposta:", text);
      return;
    }

    let data;

    try {
      data = JSON.parse(text);
    } catch (e) {
      console.log("PNCP retornou algo inválido:");
      console.log(text);
      return;
    }

    const lista = data.data || [];

    console.log("Total recebido:", lista.length);

    // =============================
    // BUSCAR CLIENTES
    // =============================
    const clientesSnap = await db.collection("clientes").get();

    const clientes = [];

    clientesSnap.forEach(doc => {

      const rawSegmentos = doc.data().segmentos || [];

      const segmentos = Array.isArray(rawSegmentos)
        ? rawSegmentos.map(s => s.trim().toLowerCase())
        : String(rawSegmentos)
            .split(",")
            .map(s => s.trim().toLowerCase());

      clientes.push({
        id: doc.id,
        ...doc.data(),
        segmentos
      });
    });

    // =============================
    // LICITAÇÕES FORMATADAS
    // =============================
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

    console.log("Processando clientes...");

    // =============================
    // LOOP CLIENTE + FILTRO SEGMENTO
    // =============================
    for (const cliente of clientes) {

      if (!cliente.segmentos || cliente.segmentos.length === 0) continue;

      for (const licitacao of licitacoes) {

        const texto = (
          licitacao.objeto +
          " " +
          licitacao.orgao
        ).toLowerCase();

        const match = cliente.segmentos.some(seg =>
          texto.includes(seg)
        );

        if (!match) continue;

        // =============================
        // EVITA DUPLICAÇÃO
        // =============================
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

      }
    }

    console.log("Radar finalizado com sucesso!");

  } catch (error) {
    console.log("ERRO:", error);
  }
}

buscarLicitacoes();
