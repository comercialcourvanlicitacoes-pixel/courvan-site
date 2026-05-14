async function buscarLicitacoes(){

  try{

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260514" +
      "&dataFinal=20260514" +
      "&codigoModalidadeContratacao=1" +
      "&pagina=1" +
      "&tamanhoPagina=1";

    const response = await fetch(url);

    const data = await response.json();

    console.log(JSON.stringify(data, null, 2));

  }catch(error){

    console.log("ERRO:");

    console.log(error);

  }

}

buscarLicitacoes();
