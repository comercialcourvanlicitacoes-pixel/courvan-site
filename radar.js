const admin = require("firebase-admin");

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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
    const data = await response.json();

    const lista = data.data || [];

    console.log("Total recebido:", lista.length);

    // =============================
    // BUSCAR CLIENTES DO FIRESTORE
    // =============================

    const clientesSnap = await db.collection("clientes").get();

    const clientes = [];

    clientesSnap.forEach(doc => {
      clientes.push({
        id: doc.id,
        ...doc.data(),
        segmentos: (doc.data().segmentos || "").toLowerCase()
      });
    });

    const categorias = {
      limpeza: ["limpeza", "zeladoria", "higienização", "conservação"],
      construcao: ["obra", "engenharia", "reforma", "pavimentação"],
      ti: ["software", "sistema", "tecnologia", "licença"],
      administrativo: ["gestão", "consultoria", "apoio administrativo"]
    };

    const licitacoes = lista.map(item => {

      const objetoTexto = item.objetoCompra || "";
      const objetoLower = objetoTexto.toLowerCase();

      const tags = Object.keys(categorias).filter(cat =>
        categorias[cat].some(p =>
          objetoLower.includes(p)
        )
      );

      return {
        orgao: item.orgaoEntidade?.razaoSocial || "Não informado",
        cidade: item.unidadeOrgao?.municipioNome || "Não informado",
        estado: item.unidadeOrgao?.ufSigla || "Não informado",
        objeto: objetoTexto,
        tags,
        valor: item.valorTotalEstimado || 0,
        modalidade: item.modalidadeNome || "Não informado",
        abertura: item.dataAberturaProposta || "Não informado",
        encerramento: item.dataEncerramentoProposta || "Não informado",
        link: item.linkSistemaOrigem || "Sem link"
      };

    });

    console.log("Processando clientes e segmentação...");

    for (const cliente of clientes) {

      if (!cliente.segmentos) continue;

      const segmentos = cliente.segmentos.split(",").map(s => s.trim());

      for (const licitacao of licitacoes) {

        const texto = (
          licitacao.objeto + " " + licitacao.orgao + " " + licitacao.tags.join(" ")
        ).toLowerCase();

        const match = segmentos.some(seg =>
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
