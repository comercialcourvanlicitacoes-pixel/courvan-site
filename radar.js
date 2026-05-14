async function buscarLicitacoes(){

  try{

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260501" +
      "&dataFinal=20260514" +
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
