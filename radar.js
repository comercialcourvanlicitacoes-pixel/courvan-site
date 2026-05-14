async function buscarLicitacoes(){

  try{

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260514" +
      "&dataFinal=20260514" +
      "&codigoModalidadeContratacao=8" +
      "&pagina=1" +
      "&tamanhoPagina=10";

    const response = await fetch(url);

    const data = await response.json();

    const palavrasChave = [
      "limpeza",
      "zeladoria",
      "conservação",
      "higienização"
    ];

    const resultados = data.data.filter((item) => {

      const objeto = item.objetoCompra?.toLowerCase() || "";

      return palavrasChave.some((palavra) =>
        objeto.includes(palavra.toLowerCase())
      );

    });

    const licitacoesFormatadas = resultados.map((item) => {

      return {

        orgao:
          item.orgaoEntidade?.razaoSocial || "Não informado",

        cidade:
          item.unidadeOrgao?.municipioNome || "Não informado",

        estado:
          item.unidadeOrgao?.ufSigla || "Não informado",

        objeto:
          item.objetoCompra || "Não informado",

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

    console.log("LICITAÇÕES FORMATADAS:");

    console.log(JSON.stringify(licitacoesFormatadas, null, 2));

  }catch(error){

    console.log("ERRO:");

    console.log(error);

  }

}

buscarLicitacoes();
