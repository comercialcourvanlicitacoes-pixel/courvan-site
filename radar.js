async function buscarLicitacoes(){

  try{

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=2026-05-01" +
      "&dataFinal=2026-05-14" +
      "&codigoModalidadeContratacao=1" +
      "&pagina=1" +
      "&tamanhoPagina=20";

    const response = await fetch(url);

    const data = await response.json();

    console.log("LICITAÇÕES ENCONTRADAS:");

    console.log(data);

  }catch(error){

    console.log("ERRO:");

    console.log(error);

  }

}

buscarLicitacoes();
