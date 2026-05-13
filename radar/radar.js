const botao = document.getElementById("buscar");

const resultados = document.getElementById("resultados");

botao.addEventListener("click", async () => {

  const palavra = document.getElementById("palavra").value;

  resultados.innerHTML = `
    <p>Buscando oportunidades...</p>
  `;

  try{

    const resposta = await fetch(
      `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao?pagina=1&tamanhoPagina=10&termo=${palavra}`
    );

    const dados = await resposta.json();

    resultados.innerHTML = "";

    if(!dados.data || dados.data.length === 0){

      resultados.innerHTML = `
        <p>Nenhuma oportunidade encontrada.</p>
      `;

      return;

    }

    dados.data.forEach(item => {

      resultados.innerHTML += `

        <div class="card">

          <h2>${item.objetoCompra || "Sem título"}</h2>

          <p>
            <strong>Órgão:</strong>
            ${item.orgaoEntidade?.razaoSocial || "Não informado"}
          </p>

          <p>
            <strong>Município:</strong>
            ${item.unidadeOrgao?.municipioNome || "Não informado"}
          </p>

          <p>
            <strong>Data:</strong>
            ${item.dataAberturaProposta || "Não informado"}
          </p>

        </div>

      `;

    });

  }catch(erro){

    console.error(erro);

    resultados.innerHTML = `
      <p>Erro ao buscar oportunidades.</p>
    `;

  }

});
