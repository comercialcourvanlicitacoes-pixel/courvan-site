const fs = require("fs");

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

    // ❌ REMOVIDO FILTRO PESADO
    // agora você NÃO corta dados aqui

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

        orgao:
          item.orgaoEntidade?.razaoSocial || "Não informado",

        cidade:
          item.unidadeOrgao?.municipioNome || "Não informado",

        estado:
          item.unidadeOrgao?.ufSigla || "Não informado",

        objeto: objetoTexto,

        // tags continuam úteis (mas não para filtro obrigatório)
        tags: Object.keys(categorias).filter(categoria =>
          categorias[categoria].some(palavra =>
            objetoLower.includes(palavra)
          )
        ),

        valor:
          item.valorTotalEstimado || 0,

        modalidade:
          item.modalidadeNome || "Não informado",

        abertura:
          item.dataAberturaProposta || "Não informado",

        encerramento:
          item.dataEncerramentoProposta || "Não informado",

        link:
          item.linkSistemaOrigem || "Sem link"

      };

    });

    console.log("Criando arquivo oportunidades.json...");

    fs.writeFileSync(
      "./oportunidades.json",
      JSON.stringify(licitacoesFormatadas, null, 2)
    );

    console.log("Arquivo criado com sucesso!");

  } catch (error) {

    console.log("ERRO:");
    console.log(error);

  }

}

buscarLicitacoes();
