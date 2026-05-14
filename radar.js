async function buscarLicitacoes(){

  try{

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260501" +
      "&dataFinal=20260514" +
      "&codigoModalidadeContratacao=1" +
      "&pagina=1" +
      "&tamanhoPagina=10";

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 20000);

    const response = await fetch(url, {
      signal: controller.signal
    });

    clearTimeout(timeout);

    console.log("Resposta recebida.");

    const data = await response.json();

    console.log("LICITAÇÕES ENCONTRADAS:");

    console.log(JSON.stringify(data, null, 2));

  }catch(error){

    console.log("ERRO:");

    console.log(error);

  }

}

buscarLicitacoes();
