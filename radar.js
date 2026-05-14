const fetch = require("node-fetch");
const admin = require("firebase-admin");

// 🔐 inicializa Firebase Admin
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// =============================
// CONFIGURAÇÃO
// =============================

// 🔥 coloque aqui os IDs dos clientes que devem receber automaticamente
const CLIENTES_ALVO = [
  "COLOQUE_CLIENTE_ID_AQUI"
];

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

    console.log("Status HTTP:", response.status);

    const data = await response.json();

    const lista = data.data || [];

    console.log("Total recebido:", lista.length);

    const categorias = {
      limpeza: ["limpeza", "zeladoria", "higienização", "conservação"],
      construcao: ["obra", "engenharia", "reforma", "pavimentação"],
      ti: ["software", "sistema", "tecnologia", "licença"],
      administrativo: ["gestão", "consultoria", "apoio administrativo"]
    };

    const licitacoesFormatadas = lista.map((item) => {

      const objetoTexto = item.objetoCompra || "";
      const objetoLower = objetoTexto.toLowerCase();

      return {

        orgao: item.orgaoEntidade?.razaoSocial || "Não informado",
        cidade: item.unidadeOrgao?.municipioNome || "Não informado",
        estado: item.unidadeOrgao?.ufSigla || "Não informado",

        objeto: objetoTexto,

        tags: Object.keys(categorias).filter(categoria =>
          categorias[categoria].some(palavra =>
            objetoLower.includes(palavra)
          )
        ),

        valor: item.valorTotalEstimado || 0,
        modalidade: item.modalidadeNome || "Não informado",
        abertura: item.dataAberturaProposta || "Não informado",
        encerramento: item.dataEncerramentoProposta || "Não informado",
        link: item.linkSistemaOrigem || "Sem link"

      };

    });

    console.log("Salvando no Firestore...");

    // =============================
    // SALVAR PARA CADA CLIENTE
    // =============================

    for (const clienteId of CLIENTES_ALVO) {

      for (const licitacao of licitacoesFormatadas) {

        const ref = db.collection("licitacoes");

        // 🔥 prevenção simples de duplicação
        const existe = await ref
          .where("clienteId", "==", clienteId)
          .where("objeto", "==", licitacao.objeto)
          .limit(1)
          .get();

        if (!existe.empty) continue;

        await ref.add({
          clienteId,
          ...licitacao,
          status: "aviso",
          dataCriacao: admin.firestore.FieldValue.serverTimestamp()
        });

      }

    }

    console.log("Radar finalizado com sucesso!");

  } catch (error) {

    console.log("ERRO:");
    console.log(error);

  }

}

buscarLicitacoes();
