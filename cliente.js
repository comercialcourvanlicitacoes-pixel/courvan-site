import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, query, where, getDocs, addDoc, doc, orderBy, onSnapshot, serverTimestamp, deleteDoc, updateDoc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, sendPasswordResetEmail, signOut, updateEmail, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const firebaseConfig = {
  apiKey: "AIzaSyBoBoaz6huE9gfAtBR4qf1ItMWzSwCEvLs",
  authDomain: "courvan-sistema.firebaseapp.com",
  projectId: "courvan-sistema",
  storageBucket: "courvan-sistema.appspot.com",
  messagingSenderId: "729755072978",
  appId: "1:729755072978:web:e76e98fd704c10da34f00b"
};

const SUPABASE_URL = "https://ruquejiboirzagcjddmp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1cXVlamlib2lyemFnY2pkZG1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAwNzE3MzQsImV4cCI6MjA5NTY0NzczNH0.FH6h--fRAHcUC5-UMMnBJtdjGY6NusijojwMcZA6zwU";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const secondaryApp = initializeApp(firebaseConfig, "SecondaryClient");
const secondaryAuth = getAuth(secondaryApp);

function escapeHTML(str) {
  if (!str) return "";
  return str.toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

emailjs.init("yg2qGBBvZjUbHwU_y");

// Desbloquear áudio em navegadores modernos via primeira interação do usuário
const desativarInteracaoSom = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      const t = new AudioCtx();
      if (t.state === "suspended") {
        t.resume();
      }
    }
  } catch (e) {
    console.warn("Erro ao iniciar áudio:", e);
  }
  window.removeEventListener("click", desativarInteracaoSom);
  window.removeEventListener("touchstart", desativarInteracaoSom);
};
window.addEventListener("click", desativarInteracaoSom);
window.addEventListener("touchstart", desativarInteracaoSom);

// ESTADO GLOBAL
let clienteIdGlobal = null;
let emailClienteGlobal = "";
let dadosClienteGlobal = null;
let filtroCanalAtivo = "tudo";
let ultimoSnapMensagens = null;
let pastaAtivaId = null;

// HELPER PARA FOTO DE PERFIL GERADA DINAMICAMENTE
function obterFotoPerfil(foto, nome) {
  if (foto && typeof foto === "string" && foto.trim() !== "") {
    const fotoTrim = foto.trim();
    if (!fotoTrim.includes("<img") && !fotoTrim.includes("style=") && !fotoTrim.includes("<span") && !fotoTrim.includes("<div")) {
      if (fotoTrim.includes("<svg") && !fotoTrim.includes(";base64,")) {
        try {
          let svgPart = fotoTrim;
          if (fotoTrim.includes(",")) {
            svgPart = fotoTrim.substring(fotoTrim.indexOf(",") + 1);
          }
          svgPart = decodeURIComponent(svgPart);
          return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgPart)));
        } catch (e) {
          console.error("Erro ao converter SVG:", e);
        }
      }
      return fotoTrim;
    }
  }
  const inicial = nome ? nome.trim().charAt(0).toUpperCase() : "C";
  const cores = [
    ["#e5b85c", "#b8862d"],
    ["#3b82f6", "#1d4ed8"],
    ["#10b981", "#047857"],
    ["#8b5cf6", "#6d28d9"],
    ["#ec4899", "#be185d"]
  ];
  const index = (inicial.charCodeAt(0) || 0) % cores.length;
  const [cor1, cor2] = cores[index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${cor1};stop-opacity:1" /><stop offset="100%" style="stop-color:${cor2};stop-opacity:1" /></linearGradient></defs><circle cx="50" cy="50" r="50" fill="url(#grad)"/><text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="'Plus Jakarta Sans', sans-serif" font-weight="800" font-size="40" fill="white">${inicial}</text></svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}

// OTIMIZAR E REDIMENSIONAR IMAGEM PARA BASE64 LEVE
window.otimizarESalvarFoto = function(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement("canvas");
        const max_size = 150;
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

window.handleUploadFoto = async function(input) {
  if (input.files && input.files[0]) {
    try {
      const base64Img = await window.otimizarESalvarFoto(input.files[0]);
      document.getElementById("previewFotoPerfil").src = base64Img;
    } catch (err) {
      console.error("Erro ao processar foto:", err);
      alert("Erro ao processar imagem.");
    }
  }
};

window.processarUploadLogo = async function(input) {
  if (input.files && input.files[0]) {
    try {
      const base64Img = await window.otimizarESalvarFoto(input.files[0]);
      document.getElementById("previewLogoEmpresa").src = base64Img;
    } catch (err) {
      console.error("Erro ao processar logo:", err);
      alert("Erro ao processar imagem.");
    }
  }
};

let respostaMensagem = null;
let chatArquivoSelecionado = null;
const mensagensCarregadas = {};

window.responderMensagemClick = function(id) {
  const m = mensagensCarregadas[id];
  if (m) {
    window.responderMensagem(id, m.texto, m.nome);
  }
};

window.responderMensagem = function(id, texto, autor){
  respostaMensagem = { id, texto, autor };
  document.getElementById("previewResposta").style.display = "block";
  document.getElementById("textoResposta").innerHTML = `<strong>${autor}</strong><br>${texto}`;
};

window.cancelarResposta = function(){
  respostaMensagem = null;
  document.getElementById("previewResposta").style.display = "none";
};

window.handleChatArquivoSelecionado = function() {
  const input = document.getElementById("chatArquivoInput");
  const file = input?.files?.[0];
  if (!file) return;

  chatArquivoSelecionado = file;
  const sizeKb = (file.size / 1024).toFixed(1);
  document.getElementById("nomeAnexoChat").innerText = `📎 ${file.name} (${sizeKb} KB)`;
  document.getElementById("previewAnexoChat").style.display = "flex";
  if (input) input.value = "";
};

window.removerAnexoChat = function() {
  chatArquivoSelecionado = null;
  document.getElementById("previewAnexoChat").style.display = "none";
};

window.toggleEmojiPickerChat = function() {
  const picker = document.getElementById("emojiPickerChat");
  if (picker) {
    picker.style.display = picker.style.display === "none" ? "block" : "none";
  }
};

window.inserirEmojiChat = function(emoji) {
  const input = document.getElementById("mensagemInput");
  if (!input) return;

  const start = input.selectionStart || 0;
  const end = input.selectionEnd || 0;
  const text = input.value;
  input.value = text.substring(0, start) + emoji + text.substring(end);
  input.focus();
  const newPos = start + emoji.length;
  input.setSelectionRange(newPos, newPos);
};

window.toggleReactionPicker = function(id) {
  const picker = document.getElementById(`reactionPicker-${id}`);
  if (picker) {
    picker.style.display = picker.style.display === "none" ? "flex" : "none";
  }
};

window.reagirMensagem = async function(mensagemId, emoji) {
  try {
    const msgRef = doc(db, "chats", clienteIdGlobal, "mensagens", mensagemId);
    const m = mensagensCarregadas[mensagemId];
    if (!m) return;

    const reacoes = { ...(m.reacoes || {}) };
    const email = auth.currentUser.email.toLowerCase();

    if (!reacoes[emoji]) {
      reacoes[emoji] = [];
    }

    const idx = reacoes[emoji].indexOf(email);
    if (idx > -1) {
      reacoes[emoji].splice(idx, 1);
    } else {
      reacoes[emoji].push(email);
    }

    if (reacoes[emoji].length === 0) {
      delete reacoes[emoji];
    }

    await updateDoc(msgRef, { reacoes });
    const picker = document.getElementById(`reactionPicker-${mensagemId}`);
    if (picker) picker.style.display = "none";
  } catch (error) {
    console.error("Erro ao reagir:", error);
  }
};

window.scrollChatToBottom = function(force = false) {
  const div = document.getElementById("mensagens");
  if (!div) return;

  const isNearBottom = div.scrollHeight - div.scrollTop - div.clientHeight < 250;
  if (force || isNearBottom) {
    div.scrollTop = div.scrollHeight;
    setTimeout(() => {
      div.scrollTop = div.scrollHeight;
    }, 100);
  }
};

// RADAR INTEGRADO
async function carregarRadarPersonalizado() {
  const statusDiv = document.getElementById("radarStatus");
  const gridDiv = document.getElementById("radarGrid");
  if (!dadosClienteGlobal || !gridDiv) return;

  try {
    statusDiv.innerHTML = "Buscando novas oportunidades no radar...";
    const response = await fetch(`./oportunidades.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const todasLicitacoes = await response.json();
    const segmentos = (dadosClienteGlobal.segmentos || "").split(",").map(s => s.trim().toLowerCase()).filter(s => s);
    const cidadesFiltro = (dadosClienteGlobal.cidadesFiltro || []).map(c => c.toLowerCase());
    const estadosFiltro = (dadosClienteGlobal.estadosFiltro || []).map(e => e.toUpperCase());
    const orgaosFiltro = (dadosClienteGlobal.orgaosFiltro || []).map(o => o.toLowerCase());

    const licitacoesFiltradas = todasLicitacoes.filter(item => {
      const objeto = (item.objeto || "").toLowerCase();
      const orgao = (item.orgao || "").toLowerCase();
      const city = (item.cidade || "").toLowerCase();
      const estado = (item.estado || "").toUpperCase();

      let matchSegmento = segmentos.length === 0;
      if (segmentos.length > 0) {
        matchSegmento = segmentos.some(s => objeto.includes(s) || orgao.includes(s));
      }
      if (!matchSegmento) return false;
      if (estadosFiltro.length > 0 && !estadosFiltro.includes(estado)) return false;
      if (cidadesFiltro.length > 0 && !cidadesFiltro.some(c => city.includes(c))) return false;
      if (orgaosFiltro.length > 0 && !orgaosFiltro.some(o => orgao.includes(o))) return false;

      return true;
    });

    gridDiv.innerHTML = "";
    statusDiv.innerHTML = `${licitacoesFiltradas.length} oportunidades encontradas para o seu perfil • Atualizado às ${new Date().toLocaleTimeString("pt-BR")}`;

    if (licitacoesFiltradas.length === 0) {
      gridDiv.innerHTML = "<div class='info-box' style='grid-column: 1/-1;'>Nenhuma oportunidade encontrada com seus filtros atuais. Tente ajustar suas palavras-chave nas configurações.</div>";
      return;
    }

    licitacoesFiltradas.forEach(item => {
      const linkValido = item.link && item.link !== "Sem link";
      gridDiv.innerHTML += `
        <div class="card-radar">
          <div class="radar-orgao">${item.orgao}</div>
          <div style="opacity:0.6; font-size:13px; margin-bottom:12px; display:flex; align-items:center; gap:4px;">📍 ${item.cidade} - ${item.estado}</div>
          <div style="font-size:14px; color:#cbd5e1; line-height:1.5; margin-bottom:18px; min-height: 42px;">${item.objeto}</div>
          <div style="font-size:13px; color:#94a3b8;"><strong>Abertura:</strong> ${item.abertura || "Não informado"}</div>
          <div class="radar-valor">R$ ${Number(item.valor).toLocaleString("pt-BR")}</div>
          <a class="radar-btn" href="${linkValido ? item.link : "#"}" target="_blank" style="${linkValido ? "" : "opacity:0.4; pointer-events:none;"}">
            ${linkValido ? "Ver Licitação" : "Link indisponível"}
          </a>
        </div>
      `;
    });
  } catch (error) {
    console.error("Erro radar:", error);
    statusDiv.innerHTML = "Erro ao conectar ao Radar de Oportunidades.";
  }
}

// SINCRONIZAÇÃO E LOGIN ON AUTH STATE CHANGED
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const emailLogado = user.email.toLowerCase().trim();
  window.equipeMap = {};

  // Listener em tempo real da equipe Courvan
  onSnapshot(collection(db, "courvan_team"), (snapshot) => {
    snapshot.forEach(docItem => {
      const d = docItem.data();
      window.equipeMap[docItem.id.toLowerCase().trim()] = {
        nome: d.nome || "Membro da Equipe",
        fotoPerfil: d.fotoPerfil || "",
        statusOnline: d.statusOnline || "offline",
        ultimoAcesso: d.ultimoAcesso || null
      };
    });
    window.renderizarMensagensDoChat();
    if (typeof window.atualizarPresencaGestorSidebar === "function") {
      window.atualizarPresencaGestorSidebar();
    }
  });

  window.inicializarPreferenciaNotificacao(emailLogado);

  let isCourvanTeam = (emailLogado === "comercial.courvanlicitacoes@gmail.com");
  if (!isCourvanTeam) {
    try {
      const teamDoc = await getDoc(doc(db, "courvan_team", emailLogado));
      if (teamDoc.exists()) isCourvanTeam = true;
    } catch (e) {
      console.error(e);
    }
  }
  window.isCourvanTeamAdmin = isCourvanTeam;

  const params = new URLSearchParams(window.location.search);
  const clienteIdUrl = params.get("id");

  let docCliente = null;
  if (clienteIdUrl) {
    const snap = await getDocs(query(collection(db, "clientes")));
    docCliente = snap.docs.find(d => d.id === clienteIdUrl);
  } else {
    // 🔥 BUSCA INTELIGENTE DE MULTI-USUÁRIOS:
    // Puxa todos os registros de clientes aos quais o email logado está autorizado
    const snap = await getDocs(query(collection(db, "clientes"), where("emailsAutorizados", "array-contains", emailLogado)));
    
    if (!snap.empty) {
      // Se o usuário está autorizado em mais de um documento de cliente, ele pode ser o cliente principal
      // de uma conta solo AND colaborador integrado no painel de outro cliente (Vanessa).
      // Para garantir o agrupamento unificado ("Gui 28-05"), damos prioridade máxima ao documento onde ele é colaborador cadastrado!
      let docs = snap.docs;
      let comoColaborador = docs.find(d => {
        const colabs = d.data().usuariosMulti || [];
        return colabs.some(u => u.email.toLowerCase().trim() === emailLogado);
      });
      docCliente = comoColaborador || docs[0];
    } else {
      // Fallback antigo pelo uid ou email principal
      let snapFallback = await getDocs(query(collection(db, "clientes"), where("email", "==", emailLogado)));
      if (snapFallback.empty) {
        snapFallback = await getDocs(query(collection(db, "clientes"), where("uid", "==", user.uid)));
      }
      if (!snapFallback.empty) docCliente = snapFallback.docs[0];
    }
  }

  if (!docCliente) {
    alert("Cliente não encontrado ou acesso não autorizado.");
    return;
  }

  dadosClienteGlobal = docCliente.data();
  clienteIdGlobal = docCliente.id;
  emailClienteGlobal = dadosClienteGlobal.email.toLowerCase().trim();

  // Garante inicialização de emailsAutorizados
  if (!dadosClienteGlobal.emailsAutorizados) {
    dadosClienteGlobal.emailsAutorizados = [dadosClienteGlobal.email.toLowerCase().trim()];
    await updateDoc(doc(db, "clientes", clienteIdGlobal), {
      emailsAutorizados: dadosClienteGlobal.emailsAutorizados
    });
  }

  function extrairNomeDoEmail(email) {
    if (!email) return "Colaborador";
    const parteLocal = email.split('@')[0];
    return parteLocal
      .split(/[\._\-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  window.atualizarCamposInterface = function() {
    if (!dadosClienteGlobal) return;
    
    let nomeUsuarioLogado = dadosClienteGlobal.nome;
    let emailUsuarioLogado = emailLogado;
    let fotoUsuarioLogado = dadosClienteGlobal.fotoPerfil || "";
    let bioUsuarioLogado = dadosClienteGlobal.bio || "";
    let eUsuarioPrincipal = emailUsuarioLogado === dadosClienteGlobal.email.toLowerCase().trim();

    const params = new URLSearchParams(window.location.search);
    const emailQuery = params.get("user") ? params.get("user").toLowerCase().trim() : null;

    if (window.isCourvanTeamAdmin) {
      if (emailQuery) {
        emailUsuarioLogado = emailQuery;
        eUsuarioPrincipal = emailUsuarioLogado === dadosClienteGlobal.email.toLowerCase().trim();
        if (eUsuarioPrincipal) {
          nomeUsuarioLogado = dadosClienteGlobal.nome;
          fotoUsuarioLogado = dadosClienteGlobal.fotoPerfil || "";
          bioUsuarioLogado = dadosClienteGlobal.bio || "";
        } else {
          const userObj = dadosClienteGlobal.usuariosMulti ? dadosClienteGlobal.usuariosMulti.find(u => u.email.toLowerCase().trim() === emailUsuarioLogado) : null;
          if (userObj) {
            nomeUsuarioLogado = userObj.nome || extrairNomeDoEmail(emailUsuarioLogado);
            fotoUsuarioLogado = userObj.fotoPerfil || "";
            bioUsuarioLogado = userObj.bio || "";
          } else {
            nomeUsuarioLogado = extrairNomeDoEmail(emailUsuarioLogado);
            fotoUsuarioLogado = "";
            bioUsuarioLogado = "";
          }
        }
      } else {
        nomeUsuarioLogado = dadosClienteGlobal.nome;
        emailUsuarioLogado = dadosClienteGlobal.email;
        fotoUsuarioLogado = dadosClienteGlobal.fotoPerfil || "";
        bioUsuarioLogado = dadosClienteGlobal.bio || "";
        eUsuarioPrincipal = true;
      }
    } else {
      if (dadosClienteGlobal.usuariosMulti) {
        const userObj = dadosClienteGlobal.usuariosMulti.find(u => u.email.toLowerCase().trim() === emailUsuarioLogado);
        if (userObj) {
          if (userObj.nome) nomeUsuarioLogado = userObj.nome;
          if (userObj.fotoPerfil) fotoUsuarioLogado = userObj.fotoPerfil;
          if (userObj.bio) bioUsuarioLogado = userObj.bio;
        }
      }
      if (!eUsuarioPrincipal && nomeUsuarioLogado === dadosClienteGlobal.nome) {
        nomeUsuarioLogado = extrairNomeDoEmail(emailUsuarioLogado);
      }
    }

    document.getElementById("nome").innerText = nomeUsuarioLogado;
    document.getElementById("nomeCliente").innerText = nomeUsuarioLogado;
    document.getElementById("bioUsuario").innerText = bioUsuarioLogado || "Nenhuma biografia adicionada.";
    
    const elBadgeCargo = document.getElementById("badgeCargo");
    if (elBadgeCargo) elBadgeCargo.innerText = eUsuarioPrincipal ? "Administrador" : "Colaborador";
    
    const elEmpresaCliente = document.getElementById("empresaCliente");
    if (elEmpresaCliente) elEmpresaCliente.innerText = dadosClienteGlobal.empresa;

    document.getElementById("empresa").innerText = dadosClienteGlobal.empresa;
    document.getElementById("email").innerText = emailUsuarioLogado;
    document.getElementById("status").innerText = dadosClienteGlobal.status || "ATIVO";

    const fotoUrlFinal = obterFotoPerfil(fotoUsuarioLogado, nomeUsuarioLogado);
    document.getElementById("fotoSidebar").src = fotoUrlFinal;
    document.getElementById("fotoPerfilCard").src = fotoUrlFinal;
    document.getElementById("previewFotoPerfil").src = fotoUrlFinal;

    if (document.activeElement !== document.getElementById("configPerfilNome")) {
      document.getElementById("configPerfilNome").value = nomeUsuarioLogado || "";
    }
    if (document.activeElement !== document.getElementById("configPerfilBio")) {
      document.getElementById("configPerfilBio").value = bioUsuarioLogado || "";
    }
    if (document.activeElement !== document.getElementById("configEmpresa")) {
      document.getElementById("configEmpresa").value = dadosClienteGlobal.empresa || "";
    }
    if (document.activeElement !== document.getElementById("configEmail")) {
      document.getElementById("configEmail").value = dadosClienteGlobal.email || "";
    }
    if (document.activeElement !== document.getElementById("configTelefone")) {
      document.getElementById("configTelefone").value = dadosClienteGlobal.telefone || "";
    }
    if (document.activeElement !== document.getElementById("configCidade")) {
      document.getElementById("configCidade").value = dadosClienteGlobal.cidade || "";
    }
    if (document.activeElement !== document.getElementById("configSegmentos")) {
      document.getElementById("configSegmentos").value = dadosClienteGlobal.segmentos || "";
    }
    if (document.activeElement !== document.getElementById("configCpfCnpj")) {
      document.getElementById("configCpfCnpj").value = dadosClienteGlobal.cpfCnpj || "";
    }
    if (document.activeElement !== document.getElementById("configCidades")) {
      document.getElementById("configCidades").value = (dadosClienteGlobal.cidadesFiltro || []).join(", ");
    }
    if (document.activeElement !== document.getElementById("configEstados")) {
      document.getElementById("configEstados").value = (dadosClienteGlobal.estadosFiltro || []).join(", ");
    }
    if (document.activeElement !== document.getElementById("configOrgaos")) {
      document.getElementById("configOrgaos").value = (dadosClienteGlobal.orgaosFiltro || []).join(", ");
    }

    // Exibe o logotipo da empresa no cabeçalho do dashboard se houver
    const logoImgHeader = document.getElementById("logoEmpresaHeader");
    const containerLogoHeader = document.getElementById("containerLogoEmpresaHeader");
    if (logoImgHeader && containerLogoHeader) {
      if (dadosClienteGlobal.logoEmpresa) {
        logoImgHeader.src = dadosClienteGlobal.logoEmpresa;
        logoImgHeader.style.display = "block";
        containerLogoHeader.style.display = "flex";
      } else {
        logoImgHeader.style.display = "none";
        containerLogoHeader.style.display = "none";
      }
    }

    // Preenche o logotipo nas configurações
    const previewLogoEmp = document.getElementById("previewLogoEmpresa");
    if (previewLogoEmp) {
      previewLogoEmp.src = dadosClienteGlobal.logoEmpresa || "";
    }

    // Sincroniza e renderiza status de atividade
    let statusOnline = "offline";
    let ultimoAcesso = null;
    
    if (eUsuarioPrincipal) {
      statusOnline = dadosClienteGlobal.statusOnline || "offline";
      ultimoAcesso = dadosClienteGlobal.ultimoAcesso || null;
    } else {
      const userObj = dadosClienteGlobal.usuariosMulti ? dadosClienteGlobal.usuariosMulti.find(u => u.email.toLowerCase().trim() === emailUsuarioLogado) : null;
      if (userObj) {
        statusOnline = userObj.statusOnline || "offline";
        ultimoAcesso = userObj.ultimoAcesso || null;
      }
    }

    const elStatusAtividade = document.getElementById("statusAtividadeUsuario");
    if (elStatusAtividade) {
      if (!ultimoAcesso) {
        elStatusAtividade.innerHTML = `<span style="color: #64748b;">● Nunca acessou</span>`;
      } else {
        const dataAcesso = new Date(ultimoAcesso);
        const agora = new Date();
        const diferencaSegundos = Math.floor((agora - dataAcesso) / 1000);
        const estaOnline = statusOnline === "online" && diferencaSegundos < 75;

        if (estaOnline) {
          elStatusAtividade.innerHTML = `<span style="color: #10b981; font-weight: 700; text-shadow: 0 0 6px rgba(16,185,129,0.3);">● Online</span>`;
          const sDot = document.getElementById("statusDot");
          if (sDot) sDot.style.background = "#10b981";
        } else {
          let descAcesso = "";
          if (diferencaSegundos < 60) {
            descAcesso = "há poucos segs";
          } else if (diferencaSegundos < 3600) {
            descAcesso = `há ${Math.floor(diferencaSegundos / 60)} min`;
          } else if (diferencaSegundos < 86400) {
            descAcesso = `há ${Math.floor(diferencaSegundos / 3600)} h`;
          } else {
            const dia = String(dataAcesso.getDate()).padStart(2, '0');
            const mes = String(dataAcesso.getMonth() + 1).padStart(2, '0');
            descAcesso = `em ${dia}/${mes}`;
          }
          elStatusAtividade.innerHTML = `<span style="color: #64748b;">● Offline (Ativo ${descAcesso})</span>`;
          const sDot = document.getElementById("statusDot");
          if (sDot) sDot.style.background = "#64748b";
        }
      }
    }

    renderizarUsuariosMulti();
    window.atualizarSelectDestinatarios();
  };

  // Inicializa a escuta em tempo real do documento do cliente
  onSnapshot(doc(db, "clientes", clienteIdGlobal), (docSnap) => {
    if (docSnap.exists()) {
      dadosClienteGlobal = docSnap.data();
      window.atualizarCamposInterface();
    }
  });

  // Executa uma vez inicialmente
  window.atualizarCamposInterface();

  listarDemandas();
  iniciarDocumentos();
  iniciarChat();
  listarLicitacoes();
  
  carregarRadarPersonalizado();
  setInterval(carregarRadarPersonalizado, 45000); 
  window.iniciarListenerDocsGerados();
  window.iniciarListenerFinanceiro();
});

window.mostrarAba = function (id) {
  document.querySelectorAll(".sidebar button").forEach(btn => btn.classList.remove("active"));
  const matchingBtn = Array.from(document.querySelectorAll(".sidebar button")).find(b => {
    const onclickStr = b.getAttribute("onclick") || "";
    return onclickStr.includes(`mostrarAba('${id}')`) || onclickStr.includes(`mostrarAba("${id}")`);
  });
  if (matchingBtn) matchingBtn.classList.add("active");

  document.querySelectorAll(".aba").forEach(a => a.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";

  if (id === "radar") carregarRadarPersonalizado();
  if (id === "chat") {
    setTimeout(() => window.scrollChatToBottom(true), 50);
  }

  const badge = document.getElementById(`badge-${id}`);
  if (badge) {
    badge.style.display = "none";
    badge.innerText = "0";
  }

  const agora = Date.now();
  const tipoUsuario = window.isCourvanTeamAdmin ? "admin" : "cliente";
  localStorage.setItem(`ultima_visualizacao_${tipoUsuario}_${clienteIdGlobal}_${id}`, agora);
};

window.ultimoContadorNaoLidos = window.ultimoContadorNaoLidos || {};

function atualizarBadgePersistente(nomeAba, registros) {
  const badge = document.getElementById(`badge-${nomeAba}`);
  if (!badge) return;

  const tipoUsuario = window.isCourvanTeamAdmin ? "admin" : "cliente";
  const ultimaVisualizacao = Number(localStorage.getItem(`ultima_visualizacao_${tipoUsuario}_${clienteIdGlobal}_${nomeAba}`) || 0);

  let naoLidos = 0;
  if (nomeAba === "chat") {
    const chatAberto = document.getElementById("chat") && document.getElementById("chat").style.display === "block";
    if (chatAberto) {
      naoLidos = 0;
    } else if (Array.isArray(registros)) {
      const emailLogado = auth.currentUser ? auth.currentUser.email.toLowerCase().trim() : "";
      registros.forEach(m => {
        const remetente = (m.remetenteEmail || "").toLowerCase().trim();
        // Não conta se for do próprio usuário logado
        if (remetente === emailLogado) return;
        
        // Só conta se não estiver marcada como lida e for posterior à última visualização
        if (m.lido !== true) {
          let dataRegistro = 0;
          if (m?.data?.seconds) dataRegistro = m.data.seconds * 1000;
          else if (m?.dataCriacao?.seconds) dataRegistro = m.dataCriacao.seconds * 1000;
          if (dataRegistro > ultimaVisualizacao) {
            naoLidos++;
          }
        }
      });
    } else {
      naoLidos = Number(registros) || 0;
    }
  } else {
    if (Array.isArray(registros)) {
      registros.forEach(item => {
        let dataRegistro = 0;
        if (item?.data?.seconds) dataRegistro = item.data.seconds * 1000;
        else if (item?.dataCriacao?.seconds) dataRegistro = item.dataCriacao.seconds * 1000;

        if (dataRegistro > ultimaVisualizacao) naoLidos++;
      });
    } else {
      naoLidos = Number(registros) || 0;
    }
  }

  const anterior = window.ultimoContadorNaoLidos[nomeAba] || 0;
  
  if (naoLidos > anterior) {
    if (typeof window.tocarSomNotificacao === "function") {
      if (nomeAba === "chat") {
        // Toca som se a última mensagem não for nossa
        const ultimaMsg = registros[registros.length - 1];
        const autorUltimo = ultimaMsg?.autor || "";
        const meuTipo = window.isCourvanTeamAdmin ? "admin" : "cliente";
        if (autorUltimo && autorUltimo !== meuTipo) {
          window.tocarSomNotificacao("chat");
        }
      } else if (nomeAba === "licitacoes") {
        window.tocarSomNotificacao("licitacao");
      } else {
        window.tocarSomNotificacao("geral");
      }
    }
  }

  window.ultimoContadorNaoLidos[nomeAba] = naoLidos;

  if (naoLidos > 0) {
    badge.style.display = "flex";
    badge.innerText = naoLidos > 99 ? "99+" : naoLidos;
  } else {
    badge.style.display = "none";
  }
}

window.salvarConfiguracoes = async function () {
  const nome = dadosClienteGlobal.nome || "";
  const empresa = document.getElementById("configEmpresa").value;
  const telefone = document.getElementById("configTelefone").value;
  const city = document.getElementById("configCidade").value;
  const cpfCnpj = document.getElementById("configCpfCnpj").value;
  const segmentos = document.getElementById("configSegmentos").value.toLowerCase().trim();
  const cidadesFiltro = document.getElementById("configCidades").value.split(",").map(v => v.trim()).filter(v => v);
  const estadosFiltro = document.getElementById("configEstados").value.split(",").map(v => v.trim().toUpperCase()).filter(v => v);
  const orgaosFiltro = document.getElementById("configOrgaos").value.split(",").map(v => v.trim()).filter(v => v);

  const novoEmail = document.getElementById("configEmail").value.trim().toLowerCase();
  const antigoEmail = dadosClienteGlobal.email.toLowerCase().trim();
  let emails = (dadosClienteGlobal.emailsAutorizados || [antigoEmail]).map(e => e.toLowerCase().trim());

  if (novoEmail && novoEmail !== antigoEmail) {
    emails = emails.map(e => e === antigoEmail ? novoEmail : e);
    if (!emails.includes(novoEmail)) emails.push(novoEmail);
  }

  let msgAuth = "";
  if (novoEmail && novoEmail !== antigoEmail) {
    try {
      if (auth.currentUser && auth.currentUser.email.toLowerCase() === antigoEmail) {
        await updateEmail(auth.currentUser, novoEmail);
        msgAuth = " E-mail de login também atualizado!";
      }
    } catch (err) {
      console.warn("Auth email update failed:", err);
      msgAuth = " (Nota: Perfil atualizado no Firestore. No Auth, saia e entre novamente para aplicar).";
    }
  }

  const elLogo = document.getElementById("previewLogoEmpresa");
  const logoEmpresaVal = elLogo ? elLogo.src : "";
  const logoParaSalvar = (logoEmpresaVal && logoEmpresaVal.startsWith("data:image")) ? logoEmpresaVal : (dadosClienteGlobal.logoEmpresa || "");

  await updateDoc(doc(db, "clientes", clienteIdGlobal), {
    nome, empresa, email: novoEmail, telefone, city, cpfCnpj, segmentos,
    cidadesFiltro, estadosFiltro, orgaosFiltro, emailsAutorizados: emails,
    logoEmpresa: logoParaSalvar
  });

  dadosClienteGlobal.cpfCnpj = cpfCnpj;
  dadosClienteGlobal = { 
    ...dadosClienteGlobal, nome, empresa, email: novoEmail, telefone, cidade: city,
    segmentos, cidadesFiltro, estadosFiltro, orgaosFiltro, emailsAutorizados: emails,
    logoEmpresa: logoParaSalvar
  };
  
  if (auth.currentUser.email.toLowerCase() === antigoEmail) {
    document.getElementById("nome").innerText = nome;
    document.getElementById("nomeCliente").innerText = nome;
    document.getElementById("email").innerText = novoEmail;
  }
  
  if (document.getElementById("empresaCliente")) {
    document.getElementById("empresaCliente").innerText = empresa;
  }
  document.getElementById("empresa").innerText = empresa;

  renderizarUsuariosMulti();
  window.atualizarSelectDestinatarios();
  alert("Configurações salvas!" + msgAuth);
  carregarRadarPersonalizado();
};

window.salvarPerfilPessoal = async function() {
  const novoNome = document.getElementById("configPerfilNome").value.trim();
  const novaBio = document.getElementById("configPerfilBio").value.trim();
  const novaFoto = document.getElementById("previewFotoPerfil").src;
  
  if (!novoNome) {
    alert("Por favor, informe seu nome.");
    return;
  }
  
  try {
    let emailUsuarioLogado = auth.currentUser.email.toLowerCase().trim();
    let usuariosMulti = dadosClienteGlobal.usuariosMulti || [];
    let idx = usuariosMulti.findIndex(u => u.email.toLowerCase().trim() === emailUsuarioLogado);
    
    const fotoParaSalvar = (novaFoto && novaFoto.startsWith("data:image/jpeg")) ? novaFoto : (novaFoto.startsWith("data:image") ? novaFoto : "");

    if (idx !== -1) {
      usuariosMulti[idx].nome = novoNome;
      usuariosMulti[idx].bio = novaBio;
      usuariosMulti[idx].fotoPerfil = fotoParaSalvar;
    } else {
      usuariosMulti.push({ nome: novoNome, email: emailUsuarioLogado, bio: novaBio, fotoPerfil: fotoParaSalvar });
    }
    
    const updateData = { usuariosMulti };
    if (emailUsuarioLogado === dadosClienteGlobal.email.toLowerCase().trim()) {
      updateData.nome = novoNome;
      updateData.bio = novaBio;
      updateData.fotoPerfil = fotoParaSalvar;
      dadosClienteGlobal.nome = novoNome;
      dadosClienteGlobal.bio = novaBio;
      dadosClienteGlobal.fotoPerfil = fotoParaSalvar;
    }
    
    await updateDoc(doc(db, "clientes", clienteIdGlobal), updateData);
    dadosClienteGlobal.usuariosMulti = usuariosMulti;
    
    document.getElementById("nome").innerText = novoNome;
    document.getElementById("nomeCliente").innerText = novoNome;
    document.getElementById("bioUsuario").innerText = novaBio || "Nenhuma biografia adicionada.";
    
    const fotoUrl = obterFotoPerfil(fotoParaSalvar, novoNome);
    document.getElementById("fotoSidebar").src = fotoUrl;
    document.getElementById("fotoPerfilCard").src = fotoUrl;
    document.getElementById("previewFotoPerfil").src = fotoUrl;
    
    alert("Perfil pessoal atualizado com sucesso!");
    renderizarUsuariosMulti();
    window.atualizarSelectDestinatarios();
  } catch (error) {
    console.error("Erro ao salvar perfil pessoal:", error);
    alert("Erro ao salvar perfil: " + error.message);
  }
};

window.atualizarPresencaGestorSidebar = function() {
  const container = document.getElementById("gestorPresencaSidebar");
  if (!container) return;

  if (window.isCourvanTeamAdmin) {
    container.style.setProperty("display", "none", "important");
    return;
  }

  const keys = Object.keys(window.equipeMap || {});
  if (keys.length === 0) {
    container.style.display = "none";
    return;
  }

  let emailGestor = keys.find(k => window.equipeMap[k].statusOnline === "online") || keys[0];
  const gestor = window.equipeMap[emailGestor];

  if (!gestor) {
    container.style.display = "none";
    return;
  }

  container.style.display = "block";
  
  const imgEl = document.getElementById("fotoGestorSidebar");
  if (imgEl) {
    imgEl.src = obterFotoPerfil(gestor.fotoPerfil || "", gestor.nome);
  }

  const nomeEl = document.getElementById("nomeGestorSidebar");
  if (nomeEl) {
    nomeEl.innerText = gestor.nome;
  }

  const dotEl = document.getElementById("dotGestorSidebar");
  const statusEl = document.getElementById("statusGestorSidebar");
  
  if (dotEl && statusEl) {
    const statusOnline = gestor.statusOnline || "offline";
    const ultimoAcesso = gestor.ultimoAcesso || null;

    if (!ultimoAcesso) {
      dotEl.style.background = "#64748b";
      statusEl.innerText = "Offline";
    } else {
      const dataAcesso = new Date(ultimoAcesso);
      const agora = new Date();
      const diferencaSegundos = Math.floor((agora - dataAcesso) / 1000);
      const estaOnline = statusOnline === "online" && diferencaSegundos < 75;

      if (estaOnline) {
        dotEl.style.background = "#10b981";
        statusEl.innerText = "Online";
        statusEl.style.color = "#10b981";
      } else {
        dotEl.style.background = "#64748b";
        statusEl.style.color = "#94a3b8";
        
        let descAcesso = "";
        if (diferencaSegundos < 60) {
          descAcesso = "há segs";
        } else if (diferencaSegundos < 3600) {
          descAcesso = `há ${Math.floor(diferencaSegundos / 60)}m`;
        } else if (diferencaSegundos < 86400) {
          descAcesso = `há ${Math.floor(diferencaSegundos / 3600)}h`;
        } else {
          const dia = String(dataAcesso.getDate()).padStart(2, '0');
          const mes = String(dataAcesso.getMonth() + 1).padStart(2, '0');
          descAcesso = `em ${dia}/${mes}`;
        }
        statusEl.innerText = `Offline (${descAcesso})`;
      }
    }
  }
};

window.renderizarUsuariosMulti = function() {
  const div = document.getElementById("listaUsuariosMulti");
  if (!div) return;
  div.innerHTML = "";
  
  function extrairNomeDoEmailHelper(email) {
    if (!email) return "Colaborador";
    const parteLocal = email.split('@')[0];
    return parteLocal
      .split(/[\._\-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  const emails = (dadosClienteGlobal.emailsAutorizados || [dadosClienteGlobal.email]).map(e => e.toLowerCase().trim());
  const usuariosList = dadosClienteGlobal.usuariosMulti || [];
  
  emails.forEach(email => {
    const isMain = email === dadosClienteGlobal.email.toLowerCase().trim();
    const userObj = usuariosList.find(u => u.email.toLowerCase().trim() === email);
    const nome = isMain ? dadosClienteGlobal.nome : (userObj ? userObj.nome : extrairNomeDoEmailHelper(email));
    const foto = isMain ? (dadosClienteGlobal.fotoPerfil || "") : (userObj ? (userObj.fotoPerfil || "") : "");
    const bio = isMain ? (dadosClienteGlobal.bio || "") : (userObj ? (userObj.bio || "") : "");
    const fotoUrl = obterFotoPerfil(foto, nome);

    let statusOnline = "offline";
    let ultimoAcesso = null;
    if (isMain) {
      statusOnline = dadosClienteGlobal.statusOnline || "offline";
      ultimoAcesso = dadosClienteGlobal.ultimoAcesso || null;
    } else if (userObj) {
      statusOnline = userObj.statusOnline || "offline";
      ultimoAcesso = userObj.ultimoAcesso || null;
    }

    let statusHtml = "";
    if (!ultimoAcesso) {
      statusHtml = `<span style="color: #64748b; font-size:11px;">● Nunca acessou</span>`;
    } else {
      const dataAcesso = new Date(ultimoAcesso);
      const agora = new Date();
      const diferencaSegundos = Math.floor((agora - dataAcesso) / 1000);
      const estaOnline = statusOnline === "online" && diferencaSegundos < 75;

      if (estaOnline) {
        statusHtml = `<span style="color: #10b981; font-size:11px; font-weight:700;">● Online</span>`;
      } else {
        let descAcesso = "";
        if (diferencaSegundos < 60) {
          descAcesso = "há poucos segs";
        } else if (diferencaSegundos < 3600) {
          descAcesso = `há ${Math.floor(diferencaSegundos / 60)} min`;
        } else if (diferencaSegundos < 86400) {
          descAcesso = `há ${Math.floor(diferencaSegundos / 3600)} h`;
        } else {
          const dia = String(dataAcesso.getDate()).padStart(2, '0');
          const mes = String(dataAcesso.getMonth() + 1).padStart(2, '0');
          descAcesso = `em ${dia}/${mes}`;
        }
        statusHtml = `<span style="color: #64748b; font-size:11px;">● Offline (Ativo ${descAcesso})</span>`;
      }
    }
    
    div.innerHTML += `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px 16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); gap:12px;">
        <div style="display:flex; align-items:center; gap:12px; flex: 1;">
          <img src="${fotoUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1.5px solid #e5b85c; background:#0c1524; flex-shrink: 0;">
          <div style="display:flex; flex-direction:column; gap:2px;">
            <span style="font-size:14px; font-weight:600; color:#e2e8f0;">${escapeHTML(nome)} ${isMain ? '<span style="color:#e5b85c; font-size:11px; margin-left:6px; font-weight:600;">(Principal)</span>' : ''}</span>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
              <span style="font-size:12px; color:#94a3b8;">${escapeHTML(email)}</span>
              <span style="color:rgba(255,255,255,0.15); font-size:10px;">|</span>
              ${statusHtml}
            </div>
            ${bio ? `<span style="font-size:11px; color:#64748b; font-style:italic; margin-top:2px;">"${escapeHTML(bio)}"</span>` : ''}
          </div>
        </div>
        ${!isMain ? `
          <button onclick="window.removerUsuarioMulti('${escapeHTML(email)}')" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:13px; font-weight:500; flex-shrink:0;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
            Remover
          </button>
        ` : ''}
      </div>
    `;
  });
};

window.adicionarNovoUsuario = async function() {
  const nomeInput = document.getElementById("novoUsuarioNome");
  const emailInput = document.getElementById("novoUsuarioEmail");
  const senhaInput = document.getElementById("novoUsuarioSenha");
  const nome = nomeInput ? nomeInput.value.trim() : "";
  const email = emailInput.value.trim().toLowerCase();
  const senha = senhaInput.value;

  if (!nome || !email || !senha) {
    alert("Preencha o nome, e-mail e a senha temporária.");
    return;
  }

  if (senha.length < 6) {
    alert("A senha deve conter pelo menos 6 caracteres.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    const emails = (dadosClienteGlobal.emailsAutorizados || [dadosClienteGlobal.email]).map(e => e.toLowerCase().trim());
    if (emails.includes(email)) {
      alert("Este e-mail já está autorizado.");
      return;
    }
    
    emails.push(email);
    const usuariosMulti = dadosClienteGlobal.usuariosMulti || [];
    usuariosMulti.push({ nome, email });
    
    await updateDoc(doc(db, "clientes", clienteIdGlobal), {
      emailsAutorizados: emails,
      usuariosMulti: usuariosMulti
    });
    
    dadosClienteGlobal.emailsAutorizados = emails;
    dadosClienteGlobal.usuariosMulti = usuariosMulti;
    
    if (nomeInput) nomeInput.value = "";
    emailInput.value = "";
    senhaInput.value = "";
    
    renderizarUsuariosMulti();
    window.atualizarSelectDestinatarios();
    alert("Usuário adicionado e cadastrado com sucesso!");
  } catch (error) {
    console.error(error);
    alert("Erro ao adicionar usuário: " + error.message);
  }
};

window.removerUsuarioMulti = async function(email) {
  const emailLower = email.toLowerCase().trim();
  if (emailLower === dadosClienteGlobal.email.toLowerCase().trim()) {
    alert("Não é possível remover o e-mail principal.");
    return;
  }
  if (!confirm(`Deseja remover o acesso de ${emailLower}?`)) return;
  
  try {
    const emails = (dadosClienteGlobal.emailsAutorizados || [dadosClienteGlobal.email]).map(e => e.toLowerCase().trim()).filter(e => e !== emailLower);
    const usuariosMulti = (dadosClienteGlobal.usuariosMulti || []).filter(u => u.email.toLowerCase().trim() !== emailLower);
    
    await updateDoc(doc(db, "clientes", clienteIdGlobal), {
      emailsAutorizados: emails,
      usuariosMulti: usuariosMulti
    });
    
    dadosClienteGlobal.emailsAutorizados = emails;
    dadosClienteGlobal.usuariosMulti = usuariosMulti;
    renderizarUsuariosMulti();
    window.atualizarSelectDestinatarios();
    alert("Usuário removido com sucesso!");
  } catch (error) {
    console.error(error);
    alert("Erro ao remover usuário: " + error.message);
  }
};

function obterLinkLicitacao(licitacao) {
  const link = (licitacao?.linkEdital || licitacao?.link || "").trim();
  if (!link) return "";
  if (link.startsWith("http://") || link.startsWith("https://")) return link;
  return `https://${link}`;
}

window.definirInteresseLicitacao = async function(id, interesseAtual) {
  const licitacaoRef = doc(db, "licitacoes", id);
  const novoValor = interesseAtual === "remover" ? "" : interesseAtual;
  await updateDoc(licitacaoRef, { interesseCliente: novoValor });
};

function listarLicitacoes() {
  const div = document.getElementById("listaLicitacoes");
  const q = query(collection(db, "licitacoes"), where("clienteId", "==", clienteIdGlobal));
  
  onSnapshot(q, (snapshot) => {
    div.innerHTML = `
      <h2 style="margin-bottom:15px;color:#e5b85c;">📢 Avisos</h2><div id="grupo-aviso" style="display:grid; gap:15px;"></div>
      <h2 style="margin:30px 0 15px;color:#fcd34d;">◄ Em Andamento</h2><div id="grupo-andamento"></div>
      <h2 style="margin:30px 0 15px;color:#10b981;">🟢 Vencidas</h2><div id="grupo-vencida"></div>
      <h2 style="margin:30px 0 15px;color:#ef4444;">🔴 Perdidas</h2><div id="grupo-perdida"></div>
      <h2 style="margin:30px 0 15px;color:#94a3b8;">⚫ Descartadas</h2><div id="grupo-descartada"></div>
    `;

    const docs = snapshot.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.dataCriacao?.seconds || 0) - (a.dataCriacao?.seconds || 0));

    atualizarBadgePersistente("licitacoes", docs);
    atualizarKpisDashboard(docs);
    
    docs.forEach((l) => {
      const status = (l.status || "aviso").trim().toLowerCase();
      const grupo = document.getElementById(`grupo-${status}`) || document.getElementById("grupo-aviso");
      const linkLicitacao = obterLinkLicitacao(l);
      const interesse = l.interesseCliente || "nao_avaliado";

      grupo.innerHTML += `
        <div style="background: rgba(255, 255, 255, 0.02); padding:26px; border-radius:20px; margin-bottom:18px; border: 1px solid rgba(255,255,255,0.04);">
          <h3 style="color:#e5b85c; font-size: 18px; margin-bottom: 12px;">${l.orgao}</h3>
          <p style="color: #cbd5e1;"><strong>Objeto:</strong> ${l.objeto}</p>
          <p style="color: #cbd5e1;"><strong>Valor:</strong> R$ ${Number(l.valor || 0).toLocaleString("pt-BR")}</p>
          <p style="color: #cbd5e1;"><strong>Sessão:</strong> ${l.dataSessao || "Não informado"}</p>

          <div style="display:flex; gap: 10px; flex-wrap: wrap; margin-top: 16px;">
            <a href="${linkLicitacao || "#"}" target="_blank" class="radar-btn" style="margin:0; padding:10px 16px; background:${linkLicitacao ? "rgba(255,255,255,0.05)" : "#334155"}; opacity:${linkLicitacao ? "1" : "0.6"}; pointer-events:${linkLicitacao ? "auto" : "none"};">
              🔗 ${linkLicitacao ? "Abrir Link da Licitação" : "Link indisponível"}
            </a>

            <button onclick="gerarPagamentoLicitacao('${l.id}', '${l.orgao}', ${Number(l.valor || 0)})" style="padding:10px 14px; border-radius:10px; border:none; background:linear-gradient(135deg,#e5b85c 0%, #d8a84e 100%); color:#060b13; font-weight:700; cursor:pointer;">
              💳 Gerar PIX
            </button>

            <button onclick="definirInteresseLicitacao('${l.id}','${interesse === "tenho_interesse" ? "remover" : "tenho_interesse"}')" style="padding:10px 14px; border-radius:10px; border:1px solid rgba(16,185,129,.4); background:${interesse === "tenho_interesse" ? "#065f46" : "rgba(6,95,70,.15)"}; color:#bbf7d0; font-weight:600; cursor:pointer;">
              ✅ Tenho interesse
            </button>
            <button onclick="definirInteresseLicitacao('${l.id}','${interesse === "sem_interesse" ? "remover" : "sem_interesse"}')" style="padding:10px 14px; border-radius:10px; border:1px solid rgba(239,68,68,.4); background:${interesse === "sem_interesse" ? "#7f1d1d" : "rgba(127,29,29,.15)"}; color:#fecaca; font-weight:600; cursor:pointer;">
              ❌ Sem interesse
            </button>
          </div>
          <div style="display:flex; gap: 12px; margin-top: 20px; align-items: center;">
            <select onchange="alterarStatusLicitacao('${l.id}', this.value)" class="inputPadrao" style="padding: 10px; flex: 2;">
              <option value="aviso" ${status === "aviso" ? "selected" : ""}>📢 Aviso</option>
              <option value="andamento" ${status === "andamento" ? "selected" : ""}>🟡 Em andamento</option>
              <option value="vencida" ${status === "vencida" ? "selected" : ""}>🟢 Vencida</option>
              <option value="perdida" ${status === "perdida" ? "selected" : ""}>🔴 Perdida</option>
              <option value="descartada" ${status === "descartada" ? "selected" : ""}>⚫ Descartada</option>
            </select>
            <button onclick="excluirLicitacao('${l.id}')" style="flex: 1; padding:11px; border-radius:12px; background:rgba(239, 68, 68, 0.1); color:#f87171; border: 1px solid rgba(239, 68, 68, 0.2); font-weight:600; cursor:pointer; transition: 0.2s;" onmouseover="this.style.background='#ef4444'; this.style.color='white'">🗑 Excluir</button>
          </div>
          <div style="margin-top:20px;">
            <button class="botaoPadrao" style="background:rgba(255,255,255,0.04); color:white; width:100%; box-shadow:none; border: 1px solid rgba(255,255,255,0.05);" onclick="abrirMovimentacoesLicitacao('${l.id}')">
              📝 Movimentações da Licitação
            </button>
            <div id="movimentacoes-${l.id}" style="display:none; margin-top:16px; background:rgba(5, 11, 19, 0.5); border-radius:14px; padding:18px; border:1px solid rgba(255,255,255,.05);">
              <div id="lista-movimentacoes-${l.id}" style="max-height:300px; overflow-y:auto; margin-bottom:15px;"></div>
              <div style="display:flex; gap:10px;">
                <textarea id="input-movimentacao-${l.id}" class="inputPadrao" placeholder="Registrar atualização..." style="height:80px; resize:none;"></textarea>
                <button class="botaoPadrao" style="padding:12px 20px;" onclick="enviarMovimentacaoLicitacao('${l.id}')">➤</button>
              </div>
            </div>
          </div>
        </div>
      `;
    });
  });
}

window.criarLicitacao = async function () {
  const orgao = document.getElementById("orgao").value;
  const objeto = document.getElementById("objeto").value;
  const valor = parseFloat(document.getElementById("valor").value) || 0;
  const dataSessao = document.getElementById("dataSessao").value;
  const linkEdital = document.getElementById("linkEdital").value;
  if (!orgao || !objeto) return alert("Preencha órgão e objeto");
  await addDoc(collection(db, "licitacoes"), {
    clienteId: clienteIdGlobal, orgao, objeto, valor, dataSessao, linkEdital, status: "aviso", dataCriacao: serverTimestamp()
  });
  document.getElementById("orgao").value = ""; 
  document.getElementById("objeto").value = "";
};

window.alterarStatusLicitacao = async (id, status) => await updateDoc(doc(db, "licitacoes", id), { status });
window.excluirLicitacao = async (id) => { if(confirm("Excluir?")) await deleteDoc(doc(db, "licitacoes", id)); };

async function listarDemandas() {
  if (!clienteIdGlobal) return;
  const snap = await getDocs(query(collection(db, "demandas"), where("clienteId", "==", clienteIdGlobal)));
  const div = document.getElementById("listaDemandas");
  if (!div) return;
  div.innerHTML = "";
  
  const demandasBadge = [];
  snap.forEach(docItem => {
    const d = docItem.data();
    demandasBadge.push(d);
    div.innerHTML += `
      <div style="background: rgba(255, 255, 255, 0.02); padding:26px; border-radius:20px; margin-bottom:18px; border: 1px solid rgba(255,255,255,0.04);">
        <h3 style="color:#e5b85c; margin-bottom: 8px; font-size: 18px;">${d.titulo}</h3>
        <p style="color:#cbd5e1; margin-bottom: 15px;">${d.descricao}</p>
        <p style="font-size: 13px;"><strong>Prazo:</strong> ${d.prazo} | <strong>Prioridade:</strong> <span style="color: ${d.prioridade==='alta'?'#ef4444':d.prioridade==='media'?'#fcd34d':'#10b981'}">${d.prioridade}</span></p>
        <div style="display:flex; gap:12px; margin-top:20px;">
          <button class="botaoPadrao" style="background:rgba(255,255,255,0.04); color:white; flex:1; box-shadow:none; border: 1px solid rgba(255,255,255,0.05);" onclick="abrirComentarios('${docItem.id}')">💬 Comentários</button>
          <button class="botaoPadrao" style="background:rgba(239, 68, 68, 0.1); color:#f87171; border: 1px solid rgba(239, 68, 68, 0.2); flex:1; box-shadow:none;" onclick="excluirDemanda('${docItem.id}')">🗑 Excluir</button>
        </div>
        <div id="comentarios-${docItem.id}" style="display:none; margin-top:20px; background:rgba(5, 11, 19, 0.5); padding:20px; border-radius:12px;">
          <div id="lista-comentarios-${docItem.id}" style="max-height:200px; overflow-y:auto; margin-bottom:15px;"></div>
          <div style="display:flex; gap:8px;">
            <input type="text" id="input-comentario-${docItem.id}" placeholder="Comentar..." class="inputPadrao" style="padding:10px;">
            <button class="botaoPadrao" style="padding:10px 20px;" onclick="enviarComentario('${docItem.id}')">➤</button>
          </div>
        </div>
      </div>
    `;
  });
  atualizarBadgePersistente("demandas", demandasBadge);
}

window.criarDemanda = async function() {
  const titulo = document.getElementById("titulo").value;
  if (!titulo) return alert("Título vazio");
  await addDoc(collection(db, "demandas"), {
    clienteId: clienteIdGlobal, titulo, descricao: document.getElementById("descricao").value,
    prazo: document.getElementById("prazo").value, prioridade: document.getElementById("prioridade").value, status: "pendente"
  });
  document.getElementById("titulo").value = ""; 
  document.getElementById("descricao").value = ""; 
  listarDemandas();
};

window.excluirDemanda = async (id) => { if(confirm("Excluir?")) { await deleteDoc(doc(db, "demandas", id)); listarDemandas(); } };
window.abrirComentarios = function(id) {
  const div = document.getElementById(`comentarios-${id}`);
  div.style.display = div.style.display === "none" ? "block" : "none";
  if(div.style.display === "block") iniciarComentarios(id);
};

window.abrirMovimentacoesLicitacao = function(id) {
  const div = document.getElementById(`movimentacoes-${id}`);
  div.style.display = div.style.display === "none" ? "block" : "none";
  if (div.style.display === "block") iniciarMovimentacoesLicitacao(id);
};

function iniciarMovimentacoesLicitacao(id) {
  const div = document.getElementById(`lista-movimentacoes-${id}`);
  onSnapshot(query(collection(db, "licitacoes", id, "movimentacoes"), orderBy("data")), snap => {
    div.innerHTML = "";
    snap.forEach(docItem => {
      const m = docItem.data();
      const isMe = m.autor === (window.isCourvanTeamAdmin ? "admin" : "cliente");
      const dataMensagem = m.data?.seconds ? new Date(m.data.seconds * 1000) : new Date();
      const dataFormatada = dataMensagem.toLocaleDateString("pt-BR") + " às " + dataMensagem.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

      div.innerHTML += `
        <div style="margin-bottom:14px; display:flex; justify-content:${isMe ? "flex-end" : "flex-start"};">
          <div style="max-width:80%; background:${isMe ? "linear-gradient(135deg,#e5b85c 0%, #d8a84e 100%)" : "rgba(255,255,255,0.04)"}; color:${isMe ? "#060b13" : "white"}; padding:14px; border-radius:14px; border-bottom-${isMe ? "right" : "left"}-radius:4px;">
            <div style="font-size:11px; opacity:.7; font-weight:700; margin-bottom:6px;">${m.nome}</div>
            <div style="font-size:14px; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere;">${m.texto}</div>
            <div style="margin-top:8px; font-size:11px; opacity:.6; text-align:right;">${dataFormatada}</div>
          </div>
        </div>
      `;
    });
    div.scrollTop = div.scrollHeight;
  });
}

window.enviarMovimentacaoLicitacao = async function(id) {
  const input = document.getElementById(`input-movimentacao-${id}`);
  if (!input.value.trim()) return;

  const isAdmin = window.isCourvanTeamAdmin;
  await addDoc(collection(db, "licitacoes", id, "movimentacoes"), {
    texto: input.value,
    autor: isAdmin ? "admin" : "cliente",
    nome: isAdmin ? "Equipe Courvan" : document.getElementById("nome").innerText,
    empresa: isAdmin ? "Courvan" : document.getElementById("empresa").innerText,
    data: serverTimestamp()
  });
  input.value = "";
};
  
window.enviarComentario = async (id) => {
  const input = document.getElementById(`input-comentario-${id}`);
  if(!input.value) return;
  await addDoc(collection(db, "demandas", id, "comentarios"), {
    texto: input.value, nome: window.isCourvanTeamAdmin ? "Equipe Courvan" : document.getElementById("nome").innerText,
    empresa: window.isCourvanTeamAdmin ? "Courvan" : document.getElementById("empresa").innerText, data: serverTimestamp()
  });
  input.value = "";
};

function iniciarComentarios(id) {
  const div = document.getElementById(`lista-comentarios-${id}`);
  onSnapshot(query(collection(db, "demandas", id, "comentarios"), orderBy("data")), snap => {
    div.innerHTML = "";
    snap.forEach(d => {
      const c = d.data();
      div.innerHTML += `<div style="font-size:13px; margin-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:8px; color: #cbd5e1;">
        <strong style="color: #e5b85c;">${c.nome}:</strong> ${c.texto}
      </div>`;
    });
  });
}

function iniciarChat() {
  const div = document.getElementById("mensagens");
  let primeiroCarregamentoChat = true;
  
  const grid = document.getElementById("emojiGridChat");
  if (grid && !grid.children.length) {
    const emojisLista = ["👍", "❤️", "😂", "😮", "😢", "🙏", "👏", "🎉", "🔥", "🚀", "👀", "💯", "✅", "❌", "📡", "🏛", "🤝", "💵", "📈", "📢", "📅", "⚙️", "💬", "📝"];
    grid.innerHTML = emojisLista.map(emoji => `
      <button onclick="window.inserirEmojiChat('${emoji}')" style="background:none; border:none; font-size:22px; cursor:pointer; padding:6px; border-radius:10px; transition:all 0.15s; display:flex; align-items:center; justify-content:center;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='none'">
        ${emoji}
      </button>
    `).join("");
  }

  onSnapshot(query(collection(db, "chats", clienteIdGlobal, "mensagens"), orderBy("data")), snap => {
    if (!primeiroCarregamentoChat) {
      const emailUsuarioLogado = auth.currentUser ? auth.currentUser.email.toLowerCase().trim() : "";
      const meuTipo = window.isCourvanTeamAdmin ? "admin" : "cliente";
      snap.docChanges().forEach(change => {
        if (change.type === "added") {
          const m = change.doc.data();
          const remetente = (m.remetenteEmail || "").toLowerCase().trim();
          const autor = m.autor || "";
          
          const destinatario = (m.destinatario || "todos").toLowerCase().trim();
          let visivel = false;
          if (destinatario === "todos" || destinatario === "geral" || destinatario === "courvan") {
            visivel = true;
          } else if (emailUsuarioLogado === remetente || emailUsuarioLogado === destinatario) {
            visivel = true;
          }
          
          if (visivel && remetente !== emailUsuarioLogado && autor !== meuTipo) {
            if (typeof window.tocarSomNotificacao === "function") {
              window.tocarSomNotificacao("chat");
            }
          }
        }
      });
    }
    ultimoSnapMensagens = snap;
    window.renderizarMensagensDoChat(primeiroCarregamentoChat);
    primeiroCarregamentoChat = false;
  });
}

window.renderizarMensagensDoChat = function(forcarScroll = false) {
  const div = document.getElementById("mensagens");
  if (!div || !ultimoSnapMensagens) return;
  
  const emailUsuarioLogado = auth.currentUser ? auth.currentUser.email.toLowerCase().trim() : "";
  const isAdmin = window.isCourvanTeamAdmin;
  let htmlAcumulado = "";

  function obterStatusPresencaDoEmail(email, autor) {
    const emailLower = (email || "").toLowerCase().trim();
    let statusOnline = "offline";
    let ultimoAcesso = null;

    if (autor === "admin") {
      const admin = window.equipeMap ? window.equipeMap[emailLower] : null;
      if (admin) {
        statusOnline = admin.statusOnline || "offline";
        ultimoAcesso = admin.ultimoAcesso || null;
      }
    } else {
      if (dadosClienteGlobal) {
        const isMain = emailLower === dadosClienteGlobal.email.toLowerCase().trim();
        if (isMain) {
          statusOnline = dadosClienteGlobal.statusOnline || "offline";
          ultimoAcesso = dadosClienteGlobal.ultimoAcesso || null;
        } else {
          const userObj = dadosClienteGlobal.usuariosMulti ? dadosClienteGlobal.usuariosMulti.find(u => u.email.toLowerCase().trim() === emailLower) : null;
          if (userObj) {
            statusOnline = userObj.statusOnline || "offline";
            ultimoAcesso = userObj.ultimoAcesso || null;
          }
        }
      }
    }

    if (!ultimoAcesso) {
      return { desc: "Nunca acessou", online: false };
    }

    const dataAcesso = new Date(ultimoAcesso);
    const agora = new Date();
    const diferencaSegundos = Math.floor((agora - dataAcesso) / 1000);
    const estaOnline = statusOnline === "online" && diferencaSegundos < 75;

    if (estaOnline) {
      return { desc: "Online", online: true };
    } else {
      let descAcesso = "";
      if (diferencaSegundos < 60) {
        descAcesso = "há poucos segs";
      } else if (diferencaSegundos < 3600) {
        descAcesso = `há ${Math.floor(diferencaSegundos / 60)} min`;
      } else if (diferencaSegundos < 86400) {
        descAcesso = `há ${Math.floor(diferencaSegundos / 3600)} h`;
      } else {
        const dia = String(dataAcesso.getDate()).padStart(2, '0');
        const mes = String(dataAcesso.getMonth() + 1).padStart(2, '0');
        descAcesso = `em ${dia}/${mes}`;
      }
      return { desc: `Offline (Ativo ${descAcesso})`, online: false };
    }
  }
  
  ultimoSnapMensagens.forEach(docSnap => {
    const mensagemId = docSnap.id;
    const m = docSnap.data();
    mensagensCarregadas[mensagemId] = m;

    const remetente = (m.remetenteEmail || "").toLowerCase().trim();
    const destinatario = (m.destinatario || "todos").toLowerCase().trim();

    // 🔐 REGRA DE PRIVACIDADE DO CHAT SEGURO MULTI-USUÁRIO
    let visivel = false;
    if (destinatario === "todos" || destinatario === "geral" || destinatario === "courvan") {
      visivel = true;
    } else if (emailUsuarioLogado === remetente || emailUsuarioLogado === destinatario) {
      visivel = true;
    }
    
    if (!visivel) return;

    if (filtroCanalAtivo === "todos" && destinatario !== "todos") return;
    if (filtroCanalAtivo === "courvan" && destinatario !== "courvan") return;
    if (filtroCanalAtivo === "dms" && (destinatario === "todos" || destinatario === "courvan")) return;

    const isMe = m.autor === (isAdmin ? "admin" : "cliente") || (remetente === emailUsuarioLogado);
    const dataMensagem = m.data?.seconds ? new Date(m.data.seconds * 1000) : new Date();
    const dataFormatada = dataMensagem.toLocaleDateString("pt-BR") + " às " + dataMensagem.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    let htmlAnexo = "";
    if (m.anexoUrl) {
      const isImg = (m.anexoTipo && m.anexoTipo.startsWith("image/")) || /\.(jpg|jpeg|png|gif|webp)$/i.test(m.anexoNome || "");
      if (isImg) {
        htmlAnexo = `
          <div style="margin-top:8px; border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.08); max-width:260px;">
            <img src="${m.anexoUrl}" style="max-width:100%; height:auto; display:block; cursor:pointer;" onclick="window.abrirAnexoMensagem('${mensagemId}')">
          </div>
        `;
      } else {
        htmlAnexo = `
          <div style="margin-top:8px;">
            <button onclick="window.abrirAnexoMensagem('${mensagemId}')" style="cursor:pointer; display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.08); color:#e5b85c; padding:10px 14px; border-radius:12px; font-size:13px; text-decoration:none; border:1px solid rgba(255,255,255,0.05); font-weight:500;">
              Anexo: 📄 ${escapeHTML(m.anexoNome || 'Abrir anexo')}
            </button>
          </div>
        `;
      }
    }

    const reacoes = m.reacoes || {};
    let htmlReacoes = "";
    const chavesReacoes = Object.keys(reacoes);

    if (chavesReacoes.length > 0) {
      htmlReacoes += `<div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">`;
      chavesReacoes.forEach(emoji => {
        const listUsuarios = reacoes[emoji] || [];
        if (listUsuarios.length > 0) {
          const euReagi = listUsuarios.includes(emailUsuarioLogado);
          htmlReacoes += `
            <button onclick="window.reagirMensagem('${mensagemId}', '${emoji}')" style="display:inline-flex; align-items:center; gap:4px; background:${euReagi ? 'rgba(229, 184, 92, 0.15)' : 'rgba(255,255,255,0.04)'}; color:${euReagi ? '#e5b85c' : '#cbd5e1'}; border:1px solid ${euReagi ? 'rgba(229, 184, 92, 0.3)' : 'rgba(255,255,255,0.05)'}; padding:4px 8px; border-radius:10px; font-size:12px; cursor:pointer;">
              <span>${emoji}</span>
              <span style="font-weight:600; font-size:11px;">${listUsuarios.length}</span>
            </button>
          `;
        }
      });
      htmlReacoes += `</div>`;
    }

    let htmlBadgeDestinatario = "";
    if (destinatario === "courvan") {
      htmlBadgeDestinatario = `<span style="background: rgba(229, 184, 92, 0.15); color: #e5b85c; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; border: 1.5px solid rgba(229, 184, 92, 0.25); text-transform: uppercase; margin-bottom: 4px; display: inline-block;">🤝 Suporte Courvan</span>`;
    } else if (destinatario !== "todos") {
      htmlBadgeDestinatario = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; border: 1.5px solid rgba(16, 185, 129, 0.25); text-transform: uppercase; margin-bottom: 4px; display: inline-block;">🔒 Privado</span>`;
    }

    const infoRemetente = window.obterInformacoesDoRemetente(remetente, m.autor, m.nome);
    const presenca = obterStatusPresencaDoEmail(remetente, m.autor);

    const htmlAvatarOutros = `
      <div style="position: relative; flex-shrink: 0;" title="${presenca.desc}">
        <img src="${infoRemetente.foto}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid ${presenca.online ? '#10b981' : 'rgba(255,255,255,0.08)'}; background: #0c1524; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <div style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; background: ${presenca.online ? '#10b981' : '#64748b'}; border-radius: 50%; border: 1.5px solid #060b13;"></div>
      </div>
    `;

    const htmlAvatarEu = `
      <div style="position: relative; flex-shrink: 0;" title="${presenca.desc}">
        <img src="${infoRemetente.foto}" style="width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid ${presenca.online ? '#10b981' : '#e5b85c'}; background: #0c1524; display: block; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">
        <div style="position: absolute; bottom: -2px; right: -2px; width: 10px; height: 10px; background: ${presenca.online ? '#10b981' : '#64748b'}; border-radius: 50%; border: 1.5px solid #060b13;"></div>
      </div>
    `;

    htmlAcumulado += `
      <div style="display: flex; gap: 12px; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; align-items: flex-end; margin-bottom: 16px;">
        ${!isMe ? htmlAvatarOutros : ""}
        <div style="display:inline-block; background:${isMe ? 'linear-gradient(135deg, #e5b85c 0%, #d8a84e 100%)' : 'rgba(255,255,255,0.04)'}; color:${isMe ? '#060b13' : 'white'}; padding:12px 16px; border-radius:16px; border-bottom-${isMe ? 'right' : 'left'}-radius:4px; max-width:70%; overflow:hidden; text-align:left; box-shadow:0 4px 10px rgba(0,0,0,0.05); border:${isMe?'none':'1px solid rgba(255,255,255,0.05)'};">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; flex-wrap: wrap;">
            <div style="font-size:11px; opacity:0.7; font-weight:600; margin-bottom:4px;">${escapeHTML(infoRemetente.nome)}</div>
            ${htmlBadgeDestinatario}
          </div>
          
          ${m.respostaTexto ? `
            <div style="background:rgba(255,255,255,.08); border-left:3px solid #e5b85c; padding:8px; border-radius:8px; margin-bottom:8px; font-size:12px; opacity:.85; overflow:hidden; text-overflow:ellipsis;">
              <strong>${escapeHTML(m.respostaAutor)}</strong><br>${escapeHTML(m.respostaTexto)}
            </div>
          ` : ""}

          <div style="font-size:14px; line-height:1.4; margin-bottom:8px; word-break:break-word; overflow-wrap:anywhere; white-space:pre-wrap;">${escapeHTML(m.texto)}</div>
          ${htmlAnexo}

          <div style="display:flex; align-items:center; gap:10px; margin-top:6px; flex-wrap:wrap;">
            <button onclick="window.responderMensagemClick('${mensagemId}')" style="margin-top:6px; background:none; border:none; color:${isMe ? '#060b13' : '#e5b85c'}; cursor:pointer; font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px;">↩ Responder</button>
            <button onclick="window.toggleReactionPicker('${mensagemId}')" style="margin-top:6px; background:none; border:none; color:${isMe ? '#060b13' : '#e5b85c'}; cursor:pointer; font-size:12px; font-weight:500; display:flex; align-items:center; gap:4px;">😀 Reagir</button>
          </div>

          <div id="reactionPicker-${mensagemId}" style="display:none; background:rgba(13, 25, 44, 0.95); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:6px; margin-top:8px; gap:6px; flex-wrap:wrap; width:fit-content; z-index:10;">
            ${["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥"].map(emoji => `
              <button onclick="window.reagirMensagem('${mensagemId}', '${emoji}')" style="background:none; border:none; font-size:18px; cursor:pointer; padding:4px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center;">${emoji}</button>
            `).join("")}
          </div>

          ${htmlReacoes}
          <div style="font-size:11px; opacity:0.6; text-align:right; display:flex; align-items:center; justify-content:flex-end; gap:4px;">
            <span>${dataFormatada}</span>
            ${isMe ? `
              ${m.lido ? `
                <span style="display: inline-flex; align-items: center; margin-left: 4px;" title="Mensagem lida">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                    <path d="M1.5 12.5L5.5 16.5L14.5 7.5" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M8.5 12.5L12.5 16.5L21.5 7.5" stroke="#1d4ed8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              ` : `
                <span style="display: inline-flex; align-items: center; margin-left: 4px; opacity: 0.55;" title="Enviada (não lida)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                    <path d="M5 12.5L9 16.5L18 7.5" stroke="#060b13" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </span>
              `}
            ` : ''}
          </div>
        </div>
        ${isMe ? htmlAvatarEu : ""}
      </div>
    `;
  });
  
  div.innerHTML = htmlAcumulado;
  window.scrollChatToBottom(forcarScroll);

  const chatAberto = document.getElementById("chat").style.display === "block";
  if (chatAberto) {
    const tipoUsuario = isAdmin ? "admin" : "cliente";
    localStorage.setItem(`ultima_visualizacao_${tipoUsuario}_${clienteIdGlobal}_chat`, Date.now());
    
    // Marcar mensagens recebidas do outro lado como lidas no Firestore
    ultimoSnapMensagens.forEach(async (docSnap) => {
      const m = docSnap.data();
      const remetenteLower = (m.remetenteEmail || "").toLowerCase().trim();
      const isFromOtherSide = remetenteLower !== emailUsuarioLogado;
      if (isFromOtherSide && m.lido !== true) {
        try {
          await updateDoc(doc(db, "chats", clienteIdGlobal, "mensagens", docSnap.id), { lido: true });
        } catch (err) {
          console.error("Erro ao marcar mensagem como lida:", err);
        }
      }
    });
  }
  
  const mensagens = [];
  ultimoSnapMensagens.forEach(docSnap => {
    const m = docSnap.data();
    const remetente = (m.remetenteEmail || "").toLowerCase().trim();
    const destinatario = (m.destinatario || "todos").toLowerCase().trim();
    
    let visivel = false;
    if (destinatario === "todos" || destinatario === "geral" || destinatario === "courvan") {
      visivel = true;
    } else if (emailUsuarioLogado === remetente || emailUsuarioLogado === destinatario) {
      visivel = true;
    }
    if (visivel) mensagens.push(m);
  });

  atualizarBadgePersistente("chat", mensagens);
};

window.filtrarCanalChat = function(canal) {
  filtroCanalAtivo = canal;
  const botoes = ["tudo", "todos", "courvan", "dms"];
  botoes.forEach(b => {
    const btn = document.getElementById(`filtroChat-${b}`);
    if (btn) {
      if (b === canal) {
        btn.style.border = "1px solid rgba(229,184,92,0.15)";
        btn.style.background = "rgba(229,184,92,0.08)";
        btn.style.color = "#e5b85c";
        btn.style.fontWeight = "600";
      } else {
        btn.style.border = "1px solid transparent";
        btn.style.background = "transparent";
        btn.style.color = "#94a3b8";
        btn.style.fontWeight = "500";
      }
    }
  });
  window.renderizarMensagensDoChat(true);
};

window.atualizarSelectDestinatarios = function() {
  const select = document.getElementById("chatDestinatario");
  if (!select) return;
  const anterior = select.value;
  
  select.innerHTML = `
    <option value="todos">📢 Todos do Grupo (Público)</option>
    <option value="courvan">🤝 Suporte Courvan (Privado)</option>
  `;
  
  const emailLogado = auth.currentUser ? auth.currentUser.email.toLowerCase().trim() : "";
  const emails = (dadosClienteGlobal?.emailsAutorizados || [dadosClienteGlobal?.email]).map(e => e.toLowerCase().trim());
  const usuariosList = dadosClienteGlobal?.usuariosMulti || [];
  
  function extrairNomeDoEmailHelper(email) {
    if (!email) return "Colaborador";
    const parteLocal = email.split('@')[0];
    return parteLocal
      .split(/[\._\-]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  emails.forEach(email => {
    if (!email) return;
    const emailLower = email.toLowerCase().trim();
    if (emailLower !== emailLogado) {
      const isMain = emailLower === dadosClienteGlobal?.email?.toLowerCase().trim();
      const userObj = usuariosList.find(u => u.email.toLowerCase().trim() === emailLower);
      const nome = isMain ? dadosClienteGlobal?.nome : (userObj ? userObj.nome : extrairNomeDoEmailHelper(email));
      select.innerHTML += `
        <option value="${emailLower}">🔒 Privado para ${escapeHTML(nome)} (${escapeHTML(emailLower)})</option>
      `;
    }
  });
  
  if (window.isCourvanTeamAdmin) {
    const emailPrincipal = dadosClienteGlobal?.email?.toLowerCase().trim();
    if (emailPrincipal && emailPrincipal !== emailLogado) {
      const nome = dadosClienteGlobal?.nome || "Cliente";
      if (![...select.options].some(opt => opt.value === emailPrincipal)) {
        select.innerHTML += `
          <option value="${emailPrincipal}">🔒 Privado para ${escapeHTML(nome)} (${escapeHTML(emailPrincipal)})</option>
        `;
      }
    }
  }
  
  if ([...select.options].some(opt => opt.value === anterior)) select.value = anterior;
};

// 🔥 ENVIO DE MENSAGENS COM MAPEAMENTO DINÂMICO DO DESTINATÁRIO REAL (SININHO DO DESTINATÁRIO)
window.enviarMensagem = async () => {
  const input = document.getElementById("mensagemInput");
  const texto = input.value.trim();
  const file = chatArquivoSelecionado;
  if (!texto && !file) return;

  const btnEnviar = document.getElementById("btnEnviarMensagem");
  if (btnEnviar) {
    btnEnviar.disabled = true;
    btnEnviar.innerText = "Enviando...";
  }

  const emailLogado = auth.currentUser.email.toLowerCase().trim();
  const isAdmin = window.isCourvanTeamAdmin;
  
  input.value = "";
  window.removerAnexoChat();
  const picker = document.getElementById("emojiPickerChat");
  if (picker) picker.style.display = "none";

  try {
    let anexoUrl = null;
    let anexoNome = null;
    let anexoTipo = null;

    if (file) {
      try {
        const base64 = await window.lerArquivoComoBase64(file);
        if (base64.length > 1300000) {
          alert("O arquivo excede o limite de 1.2MB.");
          if (btnEnviar) {
            btnEnviar.disabled = false;
            btnEnviar.innerText = "Enviar";
          }
          return;
        }
        anexoUrl = base64;
        anexoNome = file.name;
        anexoTipo = file.type;
      } catch (err) {
        console.error("Erro ao processar anexo:", err);
        alert("Erro ao carregar o arquivo.");
        if (btnEnviar) {
          btnEnviar.disabled = false;
          btnEnviar.innerText = "Enviar";
        }
        return;
      }
    }

    const destSelect = document.getElementById("chatDestinatario");
    const destinatario = destSelect ? destSelect.value : "todos";

    await addDoc(
      collection(db, "chats", clienteIdGlobal, "mensagens"),
      {
        texto,
        autor: isAdmin ? "admin" : "cliente",
        nome: isAdmin ? "Equipe Courvan" : document.getElementById("nome").innerText,
        empresa: isAdmin ? "Courvan" : document.getElementById("empresa").innerText,
        remetenteEmail: emailLogado,
        destinatario: destinatario,
        respostaId: respostaMensagem?.id || null,
        respostaTexto: respostaMensagem?.texto || null,
        respostaAutor: respostaMensagem?.autor || null,
        anexoUrl, anexoNome, anexoTipo,
        data: serverTimestamp(),
        lido: false
      }
    );

    // 🔥 MAPEAMENTO DO DESTINATÁRIO REAL PARA O EMAILJS
    let destinatarioEmail = "comercial.courvanlicitacoes@gmail.com";
    if (isAdmin) {
      if (destinatario === "todos" || destinatario === "geral" || destinatario === "courvan") {
        destinatarioEmail = emailClienteGlobal;
      } else {
        // Mensagem direta para colaborador específico
        destinatarioEmail = destinatario.toLowerCase().trim();
      }
    } else {
      if (destinatario === "courvan" || destinatario === "todos" || destinatario === "geral") {
        destinatarioEmail = "comercial.courvanlicitacoes@gmail.com";
      } else {
        // Colaborador enviando direta para outro colaborador ou para o principal
        destinatarioEmail = destinatario.toLowerCase().trim();
      }
    }

    try {
      // Puxa preferência do destinatário real
      const prefDoc = await getDoc(doc(db, "configuracoes_notificacoes", destinatarioEmail));
      let enviarEmail = true;
      if (prefDoc.exists()) {
        enviarEmail = prefDoc.data().emailHabilitado !== false;
      }
      
      if (enviarEmail) {
        await emailjs.send(
          "service_p5ln9fw",
          "template_2qckj0y",
          {
            nome: isAdmin ? "Equipe Courvan" : document.getElementById("nome").innerText,
            mensagem: file ? "Enviou um anexo no chat" : texto,
            to_email: destinatarioEmail
          }
        );
      }
    } catch (e) {
      console.log("Erro ao verificar preferências ou enviar e-mail:", e);
    }

    cancelarResposta();
    if (typeof window.tocarSomNotificacao === "function") {
      window.tocarSomNotificacao("chat");
    }
  } catch (erro) {
    console.error(erro);
    alert(erro.message || "Erro ao enviar mensagem.");
    input.value = texto;
  } finally {
    if (btnEnviar) {
      btnEnviar.disabled = false;
      btnEnviar.innerText = "Enviar";
    }
    setTimeout(() => window.scrollChatToBottom(true), 100);
  }
};

// 🔥 TECLA ENTER E SHIFT+ENTER NO TEXTAREA DO CHAT
document.getElementById("mensagemInput").addEventListener("keydown", function(e) {
  // Se pressionar Enter sozinho (sem Shift), envia a mensagem
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    window.enviarMensagem();
  }
  // Se pressionar Shift+Enter, o navegador desce para a linha de baixo naturalmente
});

// GESTÃO DOCUMENTAL
window.toggleFormDocumento = function() {
  const form = document.getElementById("formDocumentos");
  const btn = document.getElementById("btnToggleFormDoc");
  if (!form || !btn) return;
  if (form.style.display === "none") {
    form.style.display = "flex";
    btn.innerText = "✖ Cancelar";
  } else {
    form.style.display = "none";
    btn.innerText = "➕ Adicionar Documento / Link";
  }
};

window.onChangeCategoriaDoc = function() {
  const cat = document.getElementById("categoriaDocumento").value;
  const wrapperArquivo = document.getElementById("campoArquivoFisico");
  const wrapperLink = document.getElementById("campoLinkDrive");
  if (cat === "gdrive") {
    if (wrapperArquivo) wrapperArquivo.style.display = "none";
    if (wrapperLink) wrapperLink.style.display = "block";
  } else {
    if (wrapperArquivo) wrapperArquivo.style.display = "block";
    if (wrapperLink) wrapperLink.style.display = "none";
  }
};

window.onChangeTipoItemDoc = function() {
  const radio = document.querySelector('input[name="tipoItemDoc"]:checked');
  const tipo = radio ? radio.value : "arquivo";
  const isPasta = (tipo === "pasta");
  
  const campoVencimento = document.getElementById("vencimentoDocumento")?.parentElement;
  const campoStatus = document.getElementById("statusDocumento")?.parentElement;
  const wrapperFonte = document.getElementById("wrapperFonteDocumento");
  const inputNome = document.getElementById("nomeDocumento");
  const labelNome = inputNome ? inputNome.previousElementSibling : null;
  
  if (campoVencimento) campoVencimento.style.display = isPasta ? "none" : "block";
  if (campoStatus) campoStatus.style.display = isPasta ? "none" : "block";
  if (wrapperFonte) wrapperFonte.style.display = isPasta ? "none" : "block";
  if (labelNome) labelNome.innerText = isPasta ? "NOME DA SUBPASTA" : "NOME DO DOCUMENTO / ATALHO";
};

window.navegarParaPasta = function(pastaId) {
  pastaAtivaId = pastaId;
  window.renderizarDocumentos();
};

window.filtrarSubDoc = function(canal) {
  subDocFiltroAtivo = canal;
  pastaAtivaId = null;
  document.querySelectorAll("#abasSubDocumentos button").forEach(btn => btn.classList.remove("active"));
  const selectedBtn = document.getElementById(`subDocTab-${canal}`);
  if (selectedBtn) selectedBtn.classList.add("active");

  const painelPrazos = document.getElementById("painelPrazos");
  if (painelPrazos) painelPrazos.style.display = canal === "prazos" ? "block" : "none";
  window.renderizarDocumentos();
};

let documentosGlobais = [];
let subDocFiltroAtivo = "todos";

window.renderizarDocumentos = function() {
  const div = document.getElementById("listaDocumentos");
  if (!div) return;
  div.innerHTML = "";

  const hoje = new Date();
  hoje.setHours(0,0,0,0);
  let expirados = 0, vencendo = 0, validos = 0;

  documentosGlobais.forEach(d => {
    let statusPrazo = "valido";
    let diasRestantes = null;

    if (d.vencimento && d.tipoObjeto !== "pasta") {
      const parts = d.vencimento.split("-");
      const vencData = new Date(parts[0], parts[1] - 1, parts[2]);
      vencData.setHours(0,0,0,0);

      const diffTime = vencData.getTime() - hoje.getTime();
      diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diasRestantes < 0) {
        statusPrazo = "expirado";
        expirados++;
      } else if (diasRestantes <= 15) {
        statusPrazo = "vencendo";
        vencendo++;
      } else {
        statusPrazo = "valido";
        validos++;
      }
    } else if (d.tipoObjeto !== "pasta") {
      validos++;
    }

    d.statusPrazo = statusPrazo;
    d.diasRestantes = diasRestantes;
  });

  const kpiExpirados = document.getElementById("kpiExpiradosCount");
  const kpiVencendo = document.getElementById("kpiVencendoCount");
  const kpiValidos = document.getElementById("kpiValidosCount");

  if (kpiExpirados) kpiExpirados.innerText = expirados;
  if (kpiVencendo) kpiVencendo.innerText = vencendo;
  if (kpiValidos) kpiValidos.innerText = validos;

  const filtrados = documentosGlobais.filter(d => {
    if (subDocFiltroAtivo === "prazos") {
      return !!d.vencimento && d.tipoObjeto !== "pasta";
    }
    const matchPasta = (d.pastaPaiId === pastaAtivaId);
    if (!matchPasta) return false;
    if (subDocFiltroAtivo === "todos") return true;
    return d.categoria === subDocFiltroAtivo;
  });

  if (subDocFiltroAtivo !== "prazos") {
    const caminho = [];
    let atualId = pastaAtivaId;
    while (atualId) {
      const pastaObj = documentosGlobais.find(x => x.id === atualId);
      if (pastaObj) {
        caminho.unshift(pastaObj);
        atualId = pastaObj.pastaPaiId;
      } else {
        break;
      }
    }

    let htmlBreadcrumb = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px 18px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid rgba(255,255,255,0.04); font-size: 13px; color: #94a3b8;">
        <span onclick="window.navegarParaPasta(null)" style="cursor: pointer; display: flex; align-items: center; gap: 6px; color: #e5b85c; font-weight: 600;">📂 Início</span>
    `;

    caminho.forEach((segmento, idx) => {
      const isUltimo = (idx === caminho.length - 1);
      htmlBreadcrumb += `
        <span style="color: rgba(255,255,255,0.15); font-size: 11px;">▶</span>
        <span onclick="${isUltimo ? '' : `window.navegarParaPasta('${segmento.id}')`}" style="${isUltimo ? 'color: #ffffff; font-weight: 700;' : 'cursor: pointer; color: #e5b85c;'}">
          ${escapeHTML(segmento.nome)}
        </span>
      `;
    });
    htmlBreadcrumb += `</div>`;
    div.innerHTML += htmlBreadcrumb;
  }

  if (filtrados.length === 0) {
    div.innerHTML += `
      <div style="text-align: center; padding: 40px; color: #64748b; font-style: italic; background: rgba(255,255,255,0.01); border-radius: 16px; border: 1px dashed rgba(255,255,255,0.06);">
        Nenhum item encontrado nesta pasta.
      </div>
    `;
    return;
  }

  filtrados.forEach(d => {
    if (d.tipoObjeto === "pasta") {
      div.innerHTML += `
        <div style="background: linear-gradient(145deg, rgba(229, 184, 92, 0.03) 0%, rgba(5, 11, 19, 0.45) 100%); padding:20px; border-radius:20px; margin-bottom:16px; border: 1px solid rgba(229, 184, 92, 0.15); display: flex; flex-direction: column; gap: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; gap: 14px; align-items: center; cursor: pointer; flex: 1;" onclick="window.navegarParaPasta('${d.id}')">
              <div style="font-size: 28px; background: rgba(229, 184, 92, 0.1); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(229, 184, 92, 0.2); color: #e5b85c;">📁</div>
              <div>
                <h3 style="color:#ffffff; font-size: 16px; font-weight: 700; margin: 0;">${escapeHTML(d.nome)}</h3>
                <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 2px;">Pasta de Arquivos</div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <button onclick="window.navegarParaPasta('${d.id}')" class="doc-tab-btn" style="margin:0; padding: 8px 16px; background: rgba(229, 184, 92, 0.15); color: #e5b85c; font-weight: 700; border: 1px solid rgba(229, 184, 92, 0.25);">📂 Abrir Pasta</button>
              <button class="doc-tab-btn" style="margin:0; padding: 8px 16px; background: rgba(239, 68, 68, 0.08); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.15);" onclick="window.excluirDocumento('${d.id}')">🗑 Excluir</button>
            </div>
          </div>
        </div>
      `;
    } else {
      let badgePrazoHTML = "";
      if (d.vencimento) {
        if (d.statusPrazo === "expirado") {
          badgePrazoHTML = `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid rgba(239, 68, 68, 0.25);">🚨 Expirado (${Math.abs(d.diasRestantes)}d atrás)</span>`;
        } else if (d.statusPrazo === "vencendo") {
          badgePrazoHTML = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid rgba(245, 158, 11, 0.25);">⚠️ Vence em ${d.diasRestantes} dias</span>`;
        } else {
          badgePrazoHTML = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; border: 1px solid rgba(16, 185, 129, 0.25);">🟢 Válido (${d.diasRestantes}d restantes)</span>`;
        }
      }

      const categoriasMapa = { certidoes: "📜 Certidões", contratos: "✍️ Contratos", editais: "📢 Editais", habilitacao: "💼 Habilitação", gdrive: "🔗 Google Drive", outros: "📁 Outros" };
      const catTexto = categoriasMapa[d.categoria] || "📁 Documento";
      let fileIcon = "📄";
      if (d.categoria === "gdrive") fileIcon = "🔗";
      else if (d.tipo && d.tipo.includes("pdf")) fileIcon = "📕";
      else if (d.tipo && d.tipo.includes("image")) fileIcon = "🖼️";

      const uploadData = d.data?.seconds ? new Date(d.data.seconds * 1000).toLocaleDateString("pt-BR") : "";

      div.innerHTML += `
        <div style="background: linear-gradient(145deg, rgba(13, 25, 44, 0.45) 0%, rgba(5, 11, 19, 0.45) 100%); padding:24px; border-radius:20px; margin-bottom:16px; border: 1px solid rgba(255,255,255,0.04); display: flex; flex-direction: column; gap: 15px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
            <div style="display: flex; gap: 14px; align-items: center;">
              <div style="font-size: 28px; background: rgba(255,255,255,0.03); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.05);">${fileIcon}</div>
              <div>
                <h3 style="color:#ffffff; font-size: 16px; font-weight: 700; margin: 0;">${escapeHTML(d.nome)}</h3>
                <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px; flex-wrap: wrap;">
                  <span style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase;">${catTexto}</span>
                  ${uploadData ? `<span style="font-size: 11px; color: #475569;">• Upload em ${uploadData}</span>` : ""}
                </div>
              </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
              ${badgePrazoHTML}
              ${d.statusDocumento ? `<span style="background: rgba(255,255,255,0.04); color: #cbd5e1; padding: 6px 12px; border-radius: 8px; font-size: 11px; font-weight: 600; border: 1px solid rgba(255,255,255,0.06);">${escapeHTML(d.statusDocumento)}</span>` : ""}
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 14px;">
            <button onclick="window.abrirAnexoDocumento('${d.id}')" class="doc-tab-btn" style="margin: 0; padding: 10px 20px; background: linear-gradient(135deg, #e5b85c 0%, #d8a84e 100%); color: #06101e; font-weight: 700; border: none; display: flex; align-items: center; gap: 6px; cursor: pointer;">
              ${d.categoria === "gdrive" ? "🔗 Acessar Link" : "📥 Baixar / Abrir"}
            </button>
            <button class="doc-tab-btn" style="background: rgba(239, 68, 68, 0.08); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.15);" onclick="window.excluirDocumento('${d.id}', '${d.arquivo || ""}')">🗑 Excluir</button>
          </div>
        </div>
      `;
    }
  });
};

window.excluirDocumento = async (id, caminhoArquivo) => {
  if (!confirm("Excluir item? Se for pasta, todos os itens internos sumirão.")) return;
  try {
    const deletarRecursivo = async (parentFolderId) => {
      const filhos = documentosGlobais.filter(d => d.pastaPaiId === parentFolderId);
      for (const f of filhos) {
        if (f.tipoObjeto === "pasta") await deletarRecursivo(f.id);
        await deleteDoc(doc(db, "documentos", f.id));
      }
    };

    await deletarRecursivo(id);
    await deleteDoc(doc(db, "documentos", id));
    alert("Excluído.");
  } catch (error) {
    console.error(error);
  }
};

function iniciarDocumentos() {
  onSnapshot(query(collection(db, "documentos"), where("clienteId", "==", clienteIdGlobal)), snap => {
    documentosGlobais = [];
    snap.forEach(docItem => {
      const d = docItem.data();
      d.id = docItem.id;
      documentosGlobais.push(d);
    });
    documentosGlobais.sort((a, b) => (b.data?.seconds || 0) - (a.data?.seconds || 0));
    window.renderizarDocumentos();
    atualizarBadgePersistente("documentos", documentosGlobais);
  });
}

window.lerArquivoComoBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
    reader.readAsDataURL(file);
  });
};

window.abrirArquivoBase64 = (base64OrLink, nomeOriginal, categoria) => {
  if (!base64OrLink) return;
  if (categoria === "gdrive" || !base64OrLink.startsWith("data:")) {
    window.open(base64OrLink, "_blank");
    return;
  }
  try {
    const parts = base64OrLink.split(";base64,");
    const mimeType = parts[0].split(":")[1] || "application/octet-stream";
    const base64Data = parts[1];
    const sliceSize = 1024;
    const byteCharacters = atob(base64Data);
    const bytesLength = byteCharacters.length;
    const slicesCount = Math.ceil(bytesLength / sliceSize);
    const byteArrays = new Array(slicesCount);

    for (let sliceIndex = 0; sliceIndex < slicesCount; ++sliceIndex) {
      const begin = sliceIndex * sliceSize;
      const end = Math.min(begin + sliceSize, bytesLength);
      const bytes = new Array(end - begin);
      for (let offset = begin, i = 0; offset < end; ++i, ++offset) {
        bytes[i] = byteCharacters.charCodeAt(offset);
      }
      byteArrays[sliceIndex] = new Uint8Array(bytes);
    }
    const blob = new Blob(byteArrays, { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  } catch (err) {
    console.error("Erro abrir base64:", err);
  }
};

let emailHabilitadoGlobal = true;
let emailLogadoUser = "";

window.inicializarPreferenciaNotificacao = function(email) {
  if (!email) return;
  emailLogadoUser = email.toLowerCase().trim();
  onSnapshot(doc(db, "configuracoes_notificacoes", emailLogadoUser), (docSnap) => {
    emailHabilitadoGlobal = docSnap.exists() ? docSnap.data().emailHabilitado !== false : true;
    window.atualizarInterfaceSininho();
  });
};

window.atualizarInterfaceSininho = function() {
  const sininhoIconChat = document.getElementById("sininhoIconChat");
  const sininhoTextoChat = document.getElementById("sininhoTextoChat");
  if (sininhoIconChat) sininhoIconChat.innerText = emailHabilitadoGlobal ? "🔔" : "🔕";
  if (sininhoTextoChat) sininhoTextoChat.innerText = emailHabilitadoGlobal ? "E-mail: Ativado" : "E-mail: Desativado";
  
  const btnChat = document.getElementById("btnNotificacaoSininhoChat");
  if (btnChat) {
    btnChat.style.background = emailHabilitadoGlobal ? "rgba(229, 184, 92, 0.08)" : "rgba(239, 68, 68, 0.06)";
    btnChat.style.borderColor = emailHabilitadoGlobal ? "rgba(229, 184, 92, 0.2)" : "rgba(239, 68, 68, 0.15)";
    btnChat.style.color = emailHabilitadoGlobal ? "#e5b85c" : "#ef4444";
  }

  const sininhoIconConfig = document.getElementById("sininhoIconConfig");
  const sininhoDescConfig = document.getElementById("sininhoDescConfig");
  const btnToggleConfig = document.getElementById("btnToggleConfigNotif");
  if (sininhoIconConfig) sininhoIconConfig.innerText = emailHabilitadoGlobal ? "🔔" : "🔕";
  if (sininhoDescConfig) {
    sininhoDescConfig.innerText = emailHabilitadoGlobal ? "Você receberá e-mails de novas mensagens do chat." : "As notificações de e-mail estão desativadas.";
  }
  if (btnToggleConfig) {
    btnToggleConfig.innerText = emailHabilitadoGlobal ? "Desativar" : "Ativar";
    btnToggleConfig.style.background = emailHabilitadoGlobal ? "rgba(239, 68, 68, 0.1)" : "linear-gradient(135deg, #e5b85c 0%, #d8a84e 100%)";
    btnToggleConfig.style.color = emailHabilitadoGlobal ? "#ef4444" : "#06101e";
  }
};

window.togglePreferenciaNotificacao = async function() {
  if (!emailLogadoUser) return;
  const novoEstado = !emailHabilitadoGlobal;
  try {
    await setDoc(doc(db, "configuracoes_notificacoes", emailLogadoUser), { emailHabilitado: novoEstado }, { merge: true });
  } catch (err) {
    console.error(err);
  }
};

window.obterInformacoesDoRemetente = function(remetenteEmail, autor, nomeSalvo) {
  const emailLower = (remetenteEmail || "").toLowerCase().trim();
  
  if (dadosClienteGlobal && dadosClienteGlobal.email && dadosClienteGlobal.email.toLowerCase().trim() === emailLower) {
    return {
      nome: dadosClienteGlobal.nome || nomeSalvo || "Cliente Principal",
      foto: obterFotoPerfil(dadosClienteGlobal.fotoPerfil, dadosClienteGlobal.nome || nomeSalvo || "Cliente")
    };
  }
  if (dadosClienteGlobal && dadosClienteGlobal.usuariosMulti) {
    const colab = dadosClienteGlobal.usuariosMulti.find(u => u.email.toLowerCase().trim() === emailLower);
    if (colab) {
      return {
        nome: colab.nome || nomeSalvo || "Colaborador",
        foto: obterFotoPerfil(colab.fotoPerfil, colab.nome || nomeSalvo || "Colaborador")
      };
    }
  }
  if (window.equipeMap && window.equipeMap[emailLower]) {
    const mem = window.equipeMap[emailLower];
    return { nome: mem.nome || nomeSalvo || "Equipe Courvan", foto: obterFotoPerfil(mem.fotoPerfil, mem.nome) };
  }
  if (emailLower === "comercial.courvanlicitacoes@gmail.com") {
    return { nome: "Courvan Licitações", foto: obterFotoPerfil("", "Courvan Licitações") };
  }
  const nomeExibicao = nomeSalvo || (autor === "admin" ? "Equipe Courvan" : "Usuário");
  return { nome: nomeExibicao, foto: obterFotoPerfil("", nomeExibicao) };
};

window.abrirAnexoMensagem = (mensagemId) => {
  const m = mensagensCarregadas[mensagemId];
  if (!m || !m.anexoUrl) return;
  window.abrirArquivoBase64(m.anexoUrl, m.anexoNome || "anexo");
};

window.abrirAnexoDocumento = (id) => {
  const d = documentosGlobais.find(doc => doc.id === id);
  if (!d) return;
  window.abrirArquivoBase64(d.link, d.nome, d.categoria);
};

window.adicionarDocumento = async () => {
  const radio = document.querySelector('input[name="tipoItemDoc"]:checked');
  const tipoItem = radio ? radio.value : "arquivo";
  const nome = document.getElementById("nomeDocumento").value;
  const categoria = document.getElementById("categoriaDocumento").value;

  if (!nome) return alert("Digite o nome");

  let docObj = {
    clienteId: clienteIdGlobal, nome, categoria, tipoObjeto: tipoItem,
    pastaPaiId: pastaAtivaId || null, data: serverTimestamp()
  };

  if (tipoItem === "pasta") {
    docObj.vencimento = null;
    docObj.statusDocumento = null;
    docObj.link = "";
    docObj.arquivo = null;
    docObj.tipo = "pasta";
    docObj.tamanho = 0;
  } else {
    const vencimento = document.getElementById("vencimentoDocumento").value;
    const statusDocumento = document.getElementById("statusDocumento").value;
    let linkFinal = "";

    if (categoria === "gdrive") {
      linkFinal = document.getElementById("linkExternoDocumento").value;
      if (!linkFinal) return alert("Cole o link");
    } else {
      const arquivo = document.getElementById("arquivoDocumento").files[0];
      if (!arquivo) return alert("Selecione");
      linkFinal = await window.lerArquivoComoBase64(arquivo);
    }
    docObj.vencimento = vencimento || null;
    docObj.statusDocumento = statusDocumento || null;
    docObj.link = linkFinal;
  }

  await addDoc(collection(db, "documentos"), docObj);
  window.toggleFormDocumento();
};

window.alterarSenha = async () => {
  await sendPasswordResetEmail(auth, auth.currentUser.email);
  alert("Email de redefinição enviado!");
};

window.logout = async () => {
  if(confirm("Sair?")) { await signOut(auth); window.location.href = "login.html"; }
};

function moedaBRL(v) {
  return `R$ ${Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function atualizarKpisDashboard(licitacoes = []) {
  const total = licitacoes.length;
  const porStatus = { aviso: 0, andamento: 0, vencida: 0, perdida: 0, descartada: 0 };
  let interesseSim = 0, interesseNao = 0, interesseNeutro = 0;
  let valorGanho = 0, totalConcluidas = 0;

  licitacoes.forEach(l => {
    const status = (l.status || "aviso").trim().toLowerCase();
    if (porStatus[status] !== undefined) porStatus[status]++;

    const interesse = (l.interesseCliente || "nao_avaliado").trim().toLowerCase();
    if (interesse === "tenho_interesse") interesseSim++;
    else if (interesse === "sem_interesse") interesseNao++;
    else interesseNeutro++;

    if (status === "vencida") valorGanho += Number(l.valor || 0);
    if (status === "vencida" || status === "perdida" || status === "descartada") totalConcluidas++;
  });

  const ganhas = porStatus.vencida;
  const ticketMedio = ganhas > 0 ? valorGanho / ganhas : 0;
  const taxaVitoria = totalConcluidas > 0 ? (ganhas / totalConcluidas) * 100 : 0;
  const pipelineAtivo = porStatus.aviso + porStatus.andamento;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
  };

  setText("kpiTotalLicitacoes", String(total));
  setText("kpiLicitacoesGanhas", String(ganhas));
  setText("kpiValorGanho", moedaBRL(valorGanho));
  setText("kpiTaxaVitoria", `${taxaVitoria.toFixed(1)}%`);
  setText("kpiTicketMedio", moedaBRL(ticketMedio));
  setText("kpiPipelineAtivo", String(pipelineAtivo));
  setText("kpiInteresseSim", String(interesseSim));
  setText("kpiInteresseNao", String(interesseNao));
  setText("kpiInteresseNeutro", String(interesseNeutro));
}

window.gerarPagamentoLicitacao = async function (licitacaoId, orgao, valor) {
  if (!dadosClienteGlobal.cpfCnpj) return alert("CPF/CNPJ não cadastrado.");
  try {
    const response = await fetch("https://ruquejiboirzagcjddmp.supabase.co/functions/v1/clever-endpoint", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify({
        nome: dadosClienteGlobal.nome,
        email: dadosClienteGlobal.email,
        cpfCnpj: dadosClienteGlobal.cpfCnpj,
        valor: 100,
        descricao: `Licitação - ${orgao}`,
        licitacaoId
      })
    });
    const data = await response.json();
    if (data.invoiceUrl) window.location.href = data.invoiceUrl;
  } catch (err) {
    console.error(err);
  }
};

// GERADORES
window.comprimirImagem = function(file, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement("canvas");
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
        } else {
          if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
};

window.alternarSubTabGerador = function(subTab) {
  document.querySelectorAll(".sub-tab-geradores").forEach(el => el.style.display = "none");
  const target = document.getElementById(`subTabGeradores-${subTab}`);
  if (target) target.style.display = "block";
  
  if (subTab === "declaracao") {
    setTimeout(() => window.inicializarCanvasAssinatura("canvasAssinaturaDec"), 150);
  }
};

window.inicializarCanvasAssinatura = function(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = "#000000"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  let drawing = false, lastX = 0, lastY = 0;
  
  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  }
  
  canvas.addEventListener("mousedown", e => { drawing = true; const pos = getMousePos(e); lastX = pos.x; lastY = pos.y; });
  canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const pos = getMousePos(e);
    ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.stroke();
    lastX = pos.x; lastY = pos.y;
  });
  canvas.addEventListener("mouseup", () => drawing = false);
};

window.limparCanvas = function(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
};

window.tempVisuals = { timbrado: "", assinaturaDec: "" };
window.handleUploadVisual = async function(tipo, input) {
  if (input.files && input.files[0]) {
    const base64 = await window.comprimirImagem(input.files[0], 800, 220, 0.8);
    if (tipo === "timbrado") window.tempVisuals.timbrado = base64;
    else window.tempVisuals.assinaturaDec = base64;
    alert("Processada!");
  }
};

window.salvarAssinaturaDesenho = function(tipo) {
  const canvas = document.getElementById("canvasAssinaturaDec");
  if (canvas) {
    window.tempVisuals.assinaturaDec = canvas.toDataURL("image/png");
    alert("Confirmado!");
  }
};

window.alternarAssinaturaTipo = function(tipo, modo) {
  document.getElementById("decAssinaturaDesenharArea").style.display = modo === "desenhar" ? "block" : "none";
  document.getElementById("decAssinaturaUploadArea").style.display = modo === "upload" ? "block" : "none";
};

window.adicionarLinhaItemProposta = function() {
  const container = document.getElementById("containerItensProposta");
  if (!container) return;
  const count = container.querySelectorAll(".linha-item-prop").length + 1;
  const div = document.createElement("div");
  div.className = "linha-item-prop";
  div.style = "display:flex; gap:8px; align-items:center; margin-bottom:8px;";
  div.innerHTML = `
    <input class="inputPadrao item-num" placeholder="Nº" style="width:50px; margin-bottom:0;" value="${count}">
    <input class="inputPadrao item-desc" placeholder="Descrição" style="flex:2; margin-bottom:0;">
    <input class="inputPadrao item-unid" placeholder="Unid" style="width:60px; margin-bottom:0;" value="UN">
    <input class="inputPadrao item-qtd" type="number" style="width:65px; margin-bottom:0;" value="1" onchange="window.calcularTotaisProposta()">
    <input class="inputPadrao item-valor" type="number" step="0.01" style="width:100px; margin-bottom:0;" value="0.00" onchange="window.calcularTotaisProposta()">
    <button class="botaoPadrao" style="background:none; border:none; color:#ef4444; width:auto; font-size:16px;" onclick="this.parentElement.remove(); window.calcularTotaisProposta()">🗑️</button>
  `;
  container.appendChild(div);
  window.calcularTotaisProposta();
};

window.calcularTotaisProposta = function() {
  let total = 0;
  document.querySelectorAll(".linha-item-prop").forEach(linha => {
    const qtd = parseFloat(linha.querySelector(".item-qtd").value) || 0;
    const valor = parseFloat(linha.querySelector(".item-valor").value) || 0;
    total += qtd * valor;
  });
  const elTotal = document.getElementById("valorTotalPropostaPreview");
  if (elTotal) elTotal.innerText = total.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  window.atualizarPreVisualizacaoProposta();
};

window.atualizarPreVisualizacaoDeclaracao = function() {
  const empresa = document.getElementById("decEmpresa").value.trim() || "NOME DA EMPRESA LTDA";
  const cnpj = document.getElementById("decCNPJ").value.trim() || "00.000.000/0001-00";
  const endereco = document.getElementById("decEndereco").value.trim() || "Endereço da Empresa, Cidade/UF";
  const repNome = document.getElementById("decRepNome").value.trim() || "REPRESENTANTE LEGAL";
  const repCPF = document.getElementById("decRepCPF").value.trim() || "000.000.000-00";
  const repCargo = document.getElementById("decRepCargo").value.trim() || "Representante";
  const cidade = document.getElementById("decCidade").value.trim() || "Belo Horizonte";
  const dataInput = document.getElementById("decData").value;
  
  let dataFormatada = dataInput ? new Date(dataInput + "T12:00:00").toLocaleDateString("pt-BR") : "___/___/_____";
  let decHTML = "";
  
  if (document.getElementById("chkDecFatos").checked) decHTML += `<p style='margin-bottom:15px; font-size:12px;'><strong>FATOS IMPEDITIVOS:</strong> Declaramos a inexistência de fatos impeditivos.</p>`;
  if (document.getElementById("chkDecMenor").checked) decHTML += `<p style='margin-bottom:15px; font-size:12px;'><strong>TRABALHO INFANTIL:</strong> Declaramos que cumprimos a CF art 7.</p>`;

  const headerHTML = window.tempVisuals.timbrado 
    ? `<div style="text-align:center; margin-bottom:25px;"><img src="${window.tempVisuals.timbrado}" style="max-height:110px; max-width:100%; object-fit:contain;"></div>`
    : `<div style="text-align:center; border-bottom:2px solid #000; padding-bottom:15px; margin-bottom:30px;"><h2 style="font-size:20px; font-weight:800; text-transform:uppercase; margin:0;">DECLARAÇÃO UNIFICADA</h2></div>`;

  const assinaturaHTML = window.tempVisuals.assinaturaDec
    ? `<div style="text-align:center; margin-top:25px;"><img src="${window.tempVisuals.assinaturaDec}" style="max-height:80px; max-width:250px; object-fit:contain; display:block; margin:0 auto 5px auto;"><div style="border-top:1px solid #333; display:inline-block; width:280px; padding-top:4px;"><strong>${repNome}</strong><br><span style="font-size:10px; color:#555;">CPF: ${repCPF}</span></div></div>`
    : `<div style="text-align:center; margin-top:55px;"><div style="border-top:1px dashed #777; display:inline-block; width:280px; padding-top:4px;"><strong>${repNome}</strong></div></div>`;

  const fullA4Content = `
    <div style="background:white; color:black; padding:40px; font-family:'Times New Roman', serif; font-size:12px; line-height:1.6; min-height:600px; border:1px solid #ddd; max-width:800px; margin:0 auto;">
      ${headerHTML}
      <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:25px; text-decoration:underline;">DECLARAÇÃO UNIFICADA</div>
      <p>A empresa <strong>${empresa}</strong>, CNPJ <strong>${cnpj}</strong>, sediada em <strong>${endereco}</strong>, declara:</p>
      ${decHTML}
      <div style="text-align:right; margin-top:25px;">${cidade}, ${dataFormatada}.</div>
      ${assinaturaHTML}
    </div>
  `;
  document.getElementById("areaPreVisualizacaoDec").innerHTML = fullA4Content;
  return fullA4Content;
};

window.atualizarPreVisualizacaoProposta = function() {
  const empresa = document.getElementById("propEmpresa").value.trim() || "NOME DA EMPRESA LTDA";
  const cnpj = document.getElementById("propCNPJ").value.trim() || "00.000.000/0001-00";
  const orgao = document.getElementById("propOrgao").value.trim() || "ÓRGÃO PÚBLICO";
  const objeto = document.getElementById("propObjeto").value.trim() || "Objeto da licitação";
  const cidade = document.getElementById("propCidade").value.trim() || "Belo Horizonte";
  const dataInput = document.getElementById("propData").value;
  let dataFormatada = dataInput ? new Date(dataInput + "T12:00:00").toLocaleDateString("pt-BR") : "___/___/_____";

  let rowsHTML = "";
  let totalGeral = 0;
  document.querySelectorAll(".linha-item-prop").forEach(linha => {
    const num = linha.querySelector(".item-num").value || "1";
    const desc = linha.querySelector(".item-desc").value || "-";
    const unid = linha.querySelector(".item-unid").value || "UN";
    const qtd = parseFloat(linha.querySelector(".item-qtd").value) || 0;
    const valor = parseFloat(linha.querySelector(".item-valor").value) || 0;
    const sub = qtd * valor;
    totalGeral += sub;
    rowsHTML += `<tr><td style="padding:6px;">${num}</td><td style="padding:6px;">${desc}</td><td style="padding:6px;">${unid}</td><td style="padding:6px;">${qtd}</td><td style="padding:6px;">R$ ${valor}</td><td style="padding:6px;">R$ ${sub}</td></tr>`;
  });

  const fullA4Content = `
    <div style="background:white; color:black; padding:40px; font-family:'Times New Roman', serif; font-size:12px; line-height:1.6; min-height:600px; border:1px solid #ddd; max-width:800px; margin:0 auto;">
      <h2 style="text-align:center;">PROPOSTA COMERCIAL</h2>
      <p>À Comissão de Licitação da <strong>${orgao}</strong></p>
      <p>Objeto: ${objeto}</p>
      <table style="width:100%; border:1px solid #ddd; border-collapse:collapse;">
        <thead><tr style="background:#f4f4f4;"><th>Item</th><th>Descrição</th><th>Unid</th><th>Qtd</th><th>Unit</th><th>Total</th></tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
      <p style="text-align:right; font-weight:bold; margin-top:15px;">Total: R$ ${totalGeral}</p>
      <p>Cidade: ${cidade}, Data: ${dataFormatada}</p>
      <p style="text-align:center; margin-top:40px;"><strong>${empresa}</strong><br>CNPJ: ${cnpj}</p>
    </div>
  `;
  document.getElementById("areaPreVisualizacaoProp").innerHTML = fullA4Content;
  return fullA4Content;
};

window.salvarEImprimirDocumento = async function(tipo) {
  const isDec = tipo === "declaracao";
  const nomeDoc = isDec ? "Declaração Unificada" : "Proposta Comercial";
  const htmlConteudo = isDec ? window.atualizarPreVisualizacaoDeclaracao() : window.atualizarPreVisualizacaoProposta();
  
  try {
    await addDoc(collection(db, "documentos_gerados"), {
      clienteId: clienteIdGlobal, tipo, nome: nomeDoc, htmlConteudo,
      timbrado: window.tempVisuals.timbrado || "", assinatura: window.tempVisuals.assinaturaDec || "",
      dataCriacao: serverTimestamp()
    });
    
    let printArea = document.getElementById("areaImpressao");
    if (!printArea) {
      printArea = document.createElement("div");
      printArea.id = "areaImpressao";
      document.body.appendChild(printArea);
    }
    printArea.innerHTML = htmlConteudo;
    alert("Salvo! Preparando janela de impressão.");
    window.print();
  } catch (err) {
    alert("Erro: " + err.message);
  }
};

let unsubscribeDocsGerados = null;
window.iniciarListenerDocsGerados = function() {
  if (unsubscribeDocsGerados) unsubscribeDocsGerados();
  unsubscribeDocsGerados = onSnapshot(query(collection(db, "documentos_gerados"), where("clienteId", "==", clienteIdGlobal)), (snapshot) => {
    const listDiv = document.getElementById("listaDocumentosGerados");
    if (!listDiv) return;
    listDiv.innerHTML = "";
    
    snapshot.forEach(docSnap => {
      const item = docSnap.data();
      const docId = docSnap.id;
      const dataStr = item.dataCriacao?.seconds ? new Date(item.dataCriacao.seconds * 1000).toLocaleDateString("pt-BR") : "";
      const tipoLabel = item.tipo === "declaracao" ? "✍️ Declaração" : "💰 Proposta";
      
      listDiv.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:16px 20px; border-radius:15px; border:1px solid rgba(255,255,255,0.04);">
          <div>
            <span style="font-size:11px; color:#e5b85c; font-weight:700; text-transform:uppercase; display:block; margin-bottom:4px;">${tipoLabel}</span>
            <h3 style="color:#ffffff; font-size:15px; font-weight:600; margin:0;">${item.nome}</h3>
            <span style="font-size:12px; color:#64748b;">Criado em ${dataStr}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="doc-tab-btn" onclick="window.reimprimirDocumento('${docId}')">🖨️ Re-Imprimir</button>
            <button class="doc-tab-btn" style="background:rgba(239, 68, 68, 0.1); color:#f87171;" onclick="window.excluirDocumentoGerado('${docId}')">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });
  });
};

window.reimprimirDocumento = async function(docId) {
  const docSnap = await getDocs(query(collection(db, "documentos_gerados")));
  const docItem = docSnap.docs.find(d => d.id === docId);
  if (docItem) {
    let printArea = document.getElementById("areaImpressao");
    if (!printArea) {
      printArea = document.createElement("div");
      printArea.id = "areaImpressao";
      document.body.appendChild(printArea);
    }
    printArea.innerHTML = docItem.data().htmlConteudo;
    window.print();
  }
};

window.excluirDocumentoGerado = async function(docId) {
  if (confirm("Excluir permanentemente do histórico?")) {
    await deleteDoc(doc(db, "documentos_gerados", docId));
  }
};

// ==========================================
// MÓDULO FINANCEIRO - INTEGRADO AO ASAAS
// ==========================================
let unsubscribeFinanceiro = null;
let faturaSelecionadaIdGlobal = null;

window.iniciarListenerFinanceiro = function() {
  if (!clienteIdGlobal) return;
  if (unsubscribeFinanceiro) unsubscribeFinanceiro();
  
  const q = query(collection(db, "financeiro_cobrancas"), where("clienteId", "==", clienteIdGlobal));
  unsubscribeFinanceiro = onSnapshot(q, (snapshot) => {
    const tableBody = document.getElementById("financeiroTabelaFaturas");
    if (!tableBody) return;
    
    tableBody.innerHTML = "";
    
    let totalAberto = 0;
    let totalDemanda = 0;
    let temPendente = false;
    let totalFaturas = 0;
    
    snapshot.forEach(docSnap => {
      const item = docSnap.data();
      const cobrancaId = docSnap.id;
      totalFaturas++;
      
      const valor = item.valor || 0;
      const desc = item.descricao || "Fatura de Serviço";
      const tipo = item.tipo === "mensalidade" ? "Mensalidade" : "Execução Demanda";
      const vencimento = item.vencimento ? new Date(item.vencimento + "T12:00:00").toLocaleDateString("pt-BR") : "S/D";
      const status = item.status || "PENDENTE";
      
      if (status === "PENDENTE" || status === "VENCIDO") {
        totalAberto += valor;
        temPendente = true;
      }
      
      if (item.tipo === "demanda") {
        totalDemanda += valor;
      }
      
      let statusStyle = "";
      if (status === "PAGO") {
        statusStyle = "background:#10b981; color:#ffffff;";
      } else if (status === "VENCIDO") {
        statusStyle = "background:#ef4444; color:#ffffff;";
      } else {
        statusStyle = "background:#f59e0b; color:#ffffff;";
      }
      
      const pixQr = item.pixQrCode || "";
      const pixCopy = item.pixCopyPaste || "";
      const boletoBar = item.boletoBarcode || "";
      const invoiceUrl = item.invoiceUrl || "#";
      
      tableBody.innerHTML += `
        <tr style="border-bottom:1px solid rgba(255,255,255,0.04); background:rgba(255,255,255,0.01);">
          <td style="padding:14px 16px; font-weight:600; color:#e2e8f0;">${escapeHTML(desc)}</td>
          <td style="padding:14px 16px; color:#94a3b8;">${escapeHTML(tipo)}</td>
          <td style="padding:14px 16px; font-weight:700; color:#e5b85c;">R$ ${valor.toLocaleString("pt-BR", {minimumFractionDigits: 2})}</td>
          <td style="padding:14px 16px; color:#cbd5e1;">${vencimento}</td>
          <td style="padding:14px 16px;">
            <span style="font-size:11px; font-weight:700; padding:4px 10px; border-radius:20px; text-transform:uppercase; ${statusStyle}">
              ${status}
            </span>
          </td>
          <td style="padding:14px 16px; text-align:right;">
            ${status === "PENDENTE" || status === "VENCIDO" ? `
              <button class="botaoPadrao" onclick="window.abrirModalPagar('${cobrancaId}', ${valor}, '${escapeHTML(desc)}', '${escapeHTML(pixQr)}', '${escapeHTML(pixCopy)}', '${escapeHTML(boletoBar)}', '${escapeHTML(invoiceUrl)}')" style="width:auto; padding:6px 14px; font-size:11px; font-weight:600;">
                💳 Pagar Fatura
              </button>
            ` : `
              <span style="font-size:12px; color:#64748b; font-weight:500;">✓ Paga</span>
            `}
          </td>
        </tr>
      `;
    });
    
    if (totalFaturas === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="padding:40px; text-align:center; color:#64748b; font-style:italic;">
            Nenhuma fatura encontrada. Sua conta está em dia!
          </td>
        </tr>
      `;
    }
    
    // Atualizar KPIs
    const totalAbertoEl = document.getElementById("financeiroKPITotalAberto");
    const totalDemandaEl = document.getElementById("financeiroKPIDemandas");
    if (totalAbertoEl) totalAbertoEl.innerText = `R$ ${totalAberto.toLocaleString("pt-BR", {minimumFractionDigits: 2})}`;
    if (totalDemandaEl) totalDemandaEl.innerText = `R$ ${totalDemanda.toLocaleString("pt-BR", {minimumFractionDigits: 2})}`;
    
    const dot = document.getElementById("financeiroStatusGeralDot");
    const txt = document.getElementById("financeiroStatusGeralText");
    const badge = document.getElementById("badge-financeiro");
    
    if (temPendente) {
      if (dot) { dot.style.background = "#ef4444"; dot.style.boxShadow = "0 0 10px #ef4444"; }
      if (txt) { txt.innerText = "PENDENTE"; txt.style.color = "#f87171"; }
      if (badge) { badge.style.display = "flex"; badge.innerText = "!"; }
    } else {
      if (dot) { dot.style.background = "#10b981"; dot.style.boxShadow = "0 0 10px #10b981"; }
      if (txt) { txt.innerText = "REGULAR"; txt.style.color = "#4ade80"; }
      if (badge) { badge.style.display = "none"; }
    }
  });
};

window.atualizarFaturasFinanceiro = function() {
  alert("Status das faturas sincronizado com o gateway Asaas!");
  window.iniciarListenerFinanceiro();
};

window.abrirModalPagar = function(cobrancaId, valor, descricao, pixQrCode, pixCopyPaste, boletoBarcode, invoiceUrl) {
  faturaSelecionadaIdGlobal = cobrancaId;
  
  const modal = document.getElementById("modalPagarAsaas");
  if (!modal) return;
  
  document.getElementById("modalPagarDescricao").innerText = descricao;
  document.getElementById("modalPagarValor").innerText = `R$ ${valor.toLocaleString("pt-BR", {minimumFractionDigits: 2})}`;
  
  if (pixQrCode) {
    document.getElementById("pagarPixQrCode").src = pixQrCode;
  }
  if (pixCopyPaste) {
    document.getElementById("pagarPixCopyPaste").value = pixCopyPaste;
  }
  if (boletoBarcode) {
    document.getElementById("pagarBoletoCodigo").value = boletoBarcode;
  }
  if (invoiceUrl) {
    document.getElementById("pagarBoletoLink").href = invoiceUrl;
  }
  
  modal.style.display = "flex";
  window.alternarTabPagar('pix');
};

window.fecharModalPagar = function() {
  const modal = document.getElementById("modalPagarAsaas");
  if (modal) modal.style.display = "none";
  faturaSelecionadaIdGlobal = null;
};

window.alternarTabPagar = function(metodo) {
  document.querySelectorAll("#modalPagarAsaas .doc-tab-btn").forEach(btn => btn.classList.remove("active"));
  
  document.getElementById("areaPagarPix").style.display = "none";
  document.getElementById("areaPagarBoleto").style.display = "none";
  document.getElementById("areaPagarCartao").style.display = "none";
  
  if (metodo === 'pix') {
    document.getElementById("btnTabPagarPix").classList.add("active");
    document.getElementById("areaPagarPix").style.display = "flex";
  } else if (metodo === 'boleto') {
    document.getElementById("btnTabPagarBoleto").classList.add("active");
    document.getElementById("areaPagarBoleto").style.display = "flex";
  } else if (metodo === 'cartao') {
    document.getElementById("btnTabPagarCartao").classList.add("active");
    document.getElementById("areaPagarCartao").style.display = "flex";
  }
};

window.copiarTextoPagar = function(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  
  input.select();
  input.setSelectionRange(0, 99999);
  navigator.clipboard.writeText(input.value);
  alert("Código copiado com sucesso para a área de transferência!");
};

window.processarPagamentoCartaoSimulado = async function() {
  if (!faturaSelecionadaIdGlobal) return;
  try {
    const docRef = doc(db, "financeiro_cobrancas", faturaSelecionadaIdGlobal);
    await updateDoc(docRef, {
      status: "PAGO",
      formaPagamento: "CREDIT_CARD",
      dataPagamento: new Date().toISOString()
    });
    alert("Pagamento simulado no cartão de crédito aprovado com sucesso via Asaas!");
    window.fecharModalPagar();
  } catch (err) {
    console.error(err);
    alert("Erro ao processar pagamento simulado.");
  }
};

window.simularPagamentoWebhookFatura = async function() {
  if (!faturaSelecionadaIdGlobal) return;
  try {
    const docRef = doc(db, "financeiro_cobrancas", faturaSelecionadaIdGlobal);
    await updateDoc(docRef, {
      status: "PAGO",
      formaPagamento: "PIX",
      dataPagamento: new Date().toISOString()
    });
    alert("Notificação de pagamento recebida com sucesso! Webhook do Asaas simulado.");
    window.fecharModalPagar();
  } catch (err) {
    console.error(err);
    alert("Erro ao receber notificação de pagamento.");
  }
};

setTimeout(() => {
  window.alternarSubTabGerador("listar");
}, 1000);
