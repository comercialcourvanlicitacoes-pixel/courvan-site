const botao = document.getElementById("buscar");

const resultados = document.getElementById("resultados");

botao.addEventListener("click", async () => {

  const palavra = document.getElementById("palavra").value;

  resultados.innerHTML = `
    <p>Buscando oportunidades...</p>
  `;

  try{

    const resposta = await fetch(
      `https://pncp.gov.br/api/search/?q=${palavra}`
    );

    const dados = await resposta.json();

    resultados.innerHTML = "";

    if(!dados.items || dados.items.length === 0){

      resultados.innerHTML = `
        <p>Nenhuma oportunidade encontrada.</p>
      `;

      return;

    }

    dados.items.slice(0,10).forEach(item => {

      resultados.innerHTML += `

        <div class="card">

          <h2>${item.title || "Sem título"}</h2>

          <p>
            <strong>Órgão:</strong>
            ${item.organization || "Não informado"}
          </p>

          <p>
            <strong>Data:</strong>
            ${item.date || "Não informado"}
          </p>

          <p>
            <a href="${item.url}" target="_blank">
              Abrir Licitação
            </a>
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
