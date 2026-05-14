const fs = require("fs");

async function buscarLicitacoes() {

  try {

    console.log("Iniciando busca PNCP...");

    const url =
      "https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao" +
      "?dataInicial=20260514" +
      "&dataFinal=20260514" +
      "&codigoModalidadeContratacao=8" +
      "&pagina=1" +
      "&tamanhoPagina=10";

    console.log("Consultando PNCP...");

    const response = await fetch(url);

    console.log("Status HTTP:", response.status);

    const data = await response.json();

    const lista = data.data || [];

    console.log("Total recebido:", lista.length);

    // 🔎 filtro base rápido
    const palavrasChave = [
      "limpeza",
      "zeladoria",
      "conservação",
      "higienização"
    ];

    // 🧠 categorias para tags
    const categorias = {
      limpeza: ["limpeza", "zeladoria", "higienização", "conservação"],
      construcao: ["obra", "engenharia", "reforma", "pavimentação"],
      ti: ["software", "sistema", "tecnologia", "licença"],
      administrativo: ["gestão", "consultoria", "apoio administrativo"]
    };

    // ⚡ FILTRO INICIAL (leve e rápido)
    const resultados = lista.filter((item) => {

      const obj = item.objetoCompra;

      if (!obj) return false;

      const texto = obj.toLowerCase();

      return palavrasChave.some(palavra =>
        texto.includes(palavra)
      );

    });

    console.log("Quantidade filtrada:", resultados.length);

    // 🧩 MAPEAMENTO FINAL COM TAGS
    const licitacoesFormatadas = resultados.map((item) => {

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

        // 🧠 TAGS INTELIGENTES
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

    console.log("Verificando existência do arquivo...");

    console.log(fs.existsSync("./oportunidades.json"));

  } catch (error) {

    console.log("ERRO:");
    console.log(error);

  }

}

buscarLicitacoes();
