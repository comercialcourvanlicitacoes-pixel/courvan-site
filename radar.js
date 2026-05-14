async function buscarLicitacoes(){

  try{

    const response = await fetch(
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?dataInicial=2026-05-01&dataFinal=2026-05-14&pagina=1&tamanhoPagina=20"
    );

    const data = await response.json();

    console.log("LICITAÇÕES ENCONTRADAS:");

    console.log(data);

  }catch(error){

    console.log("ERRO:");

    console.log(error);

  }

}

buscarLicitacoes();
