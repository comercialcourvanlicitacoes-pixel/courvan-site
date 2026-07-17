import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc, deleteDoc, updateDoc, onSnapshot, query, where, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBoBoaz6huE9gfAtBR4qf1ItMWzSwCEvLs",
  authDomain: "courvan-sistema.firebaseapp.com",
  projectId: "courvan-sistema",
  storageBucket: "courvan-sistema.appspot.com",
  messagingSenderId: "729755072978",
  appId: "1:729755072978:web:e76e98fd704c10da34f00b"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const secondaryApp = initializeApp(firebaseConfig, "SecondaryAdmin");
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

let emailHabilitadoGlobal = true;
let emailLogadoAdmin = "";

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
  const inicial = nome ? nome.trim().charAt(0).toUpperCase() : "A";
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

window.otimizarESalvarFotoAdmin = function(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement("canvas");
        const max_size = 150;
        let width = img.width, height = img.height;
        if (width > height) {
          if (width > max_size) { height *= max_size / width; width = max_size; }
        } else {
          if (height > max_size) { width *= max_size / height; height = max_size; }
        }
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

window.handleUploadFotoAdmin = async function(input) {
  if (input.files && input.files[0]) {
    try {
      const base64Img = await window.otimizarESalvarFotoAdmin(input.files[0]);
      document.getElementById("previewFotoAdmin").src = base64Img;
    } catch (err) {
      console.error(err);
      alert("Erro ao processar imagem.");
    }
  }
};

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  emailLogadoAdmin = user.email.toLowerCase().trim();
  let nomeAdminExibicao = "Analista Courvan";
  let fotoAdminExibicao = "";
  let bioAdminExibicao = "";

  try {
    const teamDoc = await getDoc(doc(db, "courvan_team", emailLogadoAdmin));
    if (teamDoc.exists()) {
      const td = teamDoc.data();
      nomeAdminExibicao = td.nome || nomeAdminExibicao;
      fotoAdminExibicao = td.fotoPerfil || fotoAdminExibicao;
      bioAdminExibicao = td.bio || bioAdminExibicao;
    } else {
      // Se for o admin principal (comercial) e não estiver na coleção ainda, criamos por convenção
      if (emailLogadoAdmin === "comercial.courvanlicitacoes@gmail.com") {
        nomeAdminExibicao = "Courvan Comercial";
        await setDoc(doc(db, "courvan_team", emailLogadoAdmin), {
          nome: nomeAdminExibicao,
          email: emailLogadoAdmin,
          fotoPerfil: "",
          bio: "Analista Comercial Sênior"
        }, { merge: true });
      }
    }
  } catch (err) {
    console.error(err);
  }

  document.getElementById("nomeAdmin").innerText = nomeAdminExibicao;
  const fotoUrlFinal = obterFotoPerfil(fotoAdminExibicao, nomeAdminExibicao);
  document.getElementById("fotoSidebar").src = fotoUrlFinal;
  document.getElementById("previewFotoAdmin").src = fotoUrlFinal;
  
  document.getElementById("configAdminNome").value = nomeAdminExibicao;
  document.getElementById("configAdminBio").value = bioAdminExibicao;

  window.inicializarPreferenciaNotificacao(emailLogadoAdmin);

  listarClientes();
  listarTeamCourvan();
});

window.inicializarPreferenciaNotificacao = function(email) {
  if (!email) return;
  onSnapshot(doc(db, "configuracoes_notificacoes", email), (docSnap) => {
    emailHabilitadoGlobal = docSnap.exists() ? docSnap.data().emailHabilitado !== false : true;
    window.atualizarInterfaceSininho();
  });
};

window.atualizarInterfaceSininho = function() {
  const sininhoIconConfig = document.getElementById("sininhoIconConfig");
  const sininhoDescConfig = document.getElementById("sininhoDescConfig");
  const btnToggleConfig = document.getElementById("btnToggleConfigNotif");
  if (sininhoIconConfig) sininhoIconConfig.innerText = emailHabilitadoGlobal ? "🔔" : "🔕";
  if (sininhoDescConfig) {
    sininhoDescConfig.innerText = emailHabilitadoGlobal ? "Você receberá e-mails sempre que houver novas mensagens do chat de suporte." : "As notificações de e-mail estão desativadas.";
  }
  if (btnToggleConfig) {
    btnToggleConfig.innerText = emailHabilitadoGlobal ? "Desativar" : "Ativar";
    btnToggleConfig.style.background = emailHabilitadoGlobal ? "rgba(239, 68, 68, 0.1)" : "linear-gradient(135deg, #e5b85c 0%, #d8a84e 100%)";
    btnToggleConfig.style.color = emailHabilitadoGlobal ? "#ef4444" : "#06101e";
  }
};

window.togglePreferenciaNotificacaoAdmin = async function() {
  if (!emailLogadoAdmin) return;
  const novoEstado = !emailHabilitadoGlobal;
  try {
    await setDoc(doc(db, "configuracoes_notificacoes", emailLogadoAdmin), { emailHabilitado: novoEstado }, { merge: true });
  } catch (err) {
    console.error(err);
  }
};

window.salvarPerfilAdmin = async function() {
  const novoNome = document.getElementById("configAdminNome").value.trim();
  const novaBio = document.getElementById("configAdminBio").value.trim();
  const novaFoto = document.getElementById("previewFotoAdmin").src;
  
  if (!novoNome) {
    alert("Por favor, preencha o seu nome.");
    return;
  }
  
  try {
    const fotoParaSalvar = (novaFoto && novaFoto.startsWith("data:image/jpeg")) ? novaFoto : (novaFoto.startsWith("data:image") ? novaFoto : "");
    await setDoc(doc(db, "courvan_team", emailLogadoAdmin), {
      nome: novoNome,
      bio: novaBio,
      fotoPerfil: fotoParaSalvar,
      email: emailLogadoAdmin
    }, { merge: true });
    
    document.getElementById("nomeAdmin").innerText = novoNome;
    const fotoUrl = obterFotoPerfil(fotoParaSalvar, novoNome);
    document.getElementById("fotoSidebar").src = fotoUrl;
    document.getElementById("previewFotoAdmin").src = fotoUrl;
    
    alert("Perfil atualizado com sucesso!");
    listarTeamCourvan();
  } catch (error) {
    console.error(error);
    alert("Erro ao salvar perfil: " + error.message);
  }
};

window.mostrarAba = function(id) {
  document.querySelectorAll(".sidebar button").forEach(btn => btn.classList.remove("active"));
  const matchingBtn = Array.from(document.querySelectorAll(".sidebar button")).find(b => {
    const onclickStr = b.getAttribute("onclick") || "";
    return onclickStr.includes(`mostrarAba('${id}')`) || onclickStr.includes(`mostrarAba("${id}")`);
  });
  if (matchingBtn) matchingBtn.classList.add("active");

  document.querySelectorAll(".aba").forEach(a => a.style.display = "none");
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
};

window.cadastrarCliente = async () => {
  const nome = document.getElementById("novoNome").value.trim();
  const empresa = document.getElementById("novoEmpresa").value.trim();
  const email = document.getElementById("novoEmail").value.trim().toLowerCase();
  const senha = document.getElementById("novoSenha").value;
  const telefone = document.getElementById("novoTelefone").value.trim();
  const cidade = document.getElementById("novoCidade").value.trim();
  const cpfCnpj = document.getElementById("novoCpfCnpj").value.trim();

  if (!nome || !empresa || !email || !senha) {
    alert("Preencha Nome, Empresa, E-mail e Senha!");
    return;
  }

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    await addDoc(collection(db, "clientes"), {
      uid: cred.user.uid,
      nome, empresa, email, telefone, cidade, cpfCnpj,
      segmentos: "",
      cidadesFiltro: [],
      estadosFiltro: [],
      orgaosFiltro: [],
      emailsAutorizados: [email],
      status: "ATIVO"
    });

    document.getElementById("novoNome").value = "";
    document.getElementById("novoEmpresa").value = "";
    document.getElementById("novoEmail").value = "";
    document.getElementById("novoSenha").value = "";
    document.getElementById("novoTelefone").value = "";
    document.getElementById("novoCidade").value = "";
    document.getElementById("novoCpfCnpj").value = "";

    alert("Cliente cadastrado com sucesso!");
    listarClientes();
  } catch (err) {
    console.error(err);
    alert("Erro ao cadastrar: " + err.message);
  }
};

function listarClientes() {
  const div = document.getElementById("listaClientes");
  onSnapshot(collection(db, "clientes"), snap => {
    div.innerHTML = "";
    snap.forEach(docSnap => {
      const c = docSnap.data();
      const cId = docSnap.id;
      const emails = (c.emailsAutorizados || [c.email]).map(e => e.toLowerCase().trim());
      
      div.innerHTML += `
        <div style="background: rgba(255, 255, 255, 0.02); padding:26px; border-radius:20px; margin-bottom:18px; border: 1px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:15px;">
          <div>
            <h3 style="color:#e5b85c; font-size:18px; margin-bottom:6px;">${escapeHTML(c.empresa)}</h3>
            <p style="margin:0; font-size:14px; color:#cbd5e1;"><strong>Responsável:</strong> ${escapeHTML(c.nome)}</p>
            <p style="margin:4px 0 0 0; font-size:14px; color:#cbd5e1;"><strong>E-mail:</strong> ${escapeHTML(c.email)}</p>
            <div style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">
              ${emails.map(e => `<span style="font-size:11px; background:rgba(255,255,255,0.04); color:#94a3b8; border:1px solid rgba(255,255,255,0.05); padding:2px 8px; border-radius:4px;">🔑 ${escapeHTML(e)}</span>`).join("")}
            </div>
          </div>
          <div style="display:flex; gap:12px;">
            <button onclick="abrirPainelCliente('${cId}')" class="botaoPadrao" style="padding:12px 20px; font-size:13px;">📊 Abrir Painel</button>
            <button onclick="excluirCliente('${cId}')" class="botaoPadrao" style="background:rgba(239, 68, 68, 0.1); color:#f87171; border:1px solid rgba(239, 68, 68, 0.2); box-shadow:none; padding:12px 20px; font-size:13px;">🗑️ Excluir</button>
          </div>
        </div>
      `;
    });
  });
}

window.abrirPainelCliente = function(id) {
  window.open(`cliente.html?id=${id}`, "_blank");
};

window.excluirCliente = async (id) => {
  if (confirm("Excluir cliente permanentemente?")) {
    await deleteDoc(doc(db, "clientes", id));
  }
};

window.listarTeamCourvan = function() {
  const div = document.getElementById("listaTeamCourvan");
  if (!div) return;
  onSnapshot(collection(db, "courvan_team"), snap => {
    div.innerHTML = "";
    snap.forEach(docSnap => {
      const t = docSnap.data();
      const email = docSnap.id.toLowerCase().trim();
      const fotoUrl = obterFotoPerfil(t.fotoPerfil, t.nome);
      
      div.innerHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:12px 16px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); gap:12px;">
          <div style="display:flex; align-items:center; gap:12px; flex: 1;">
            <img src="${fotoUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1.5px solid #e5b85c; background:#0c1524; flex-shrink: 0;">
            <div style="display:flex; flex-direction:column; gap:2px;">
              <span style="font-size:14px; font-weight:600; color:#e2e8f0;">${escapeHTML(t.nome || "Analista")}</span>
              <span style="font-size:12px; color:#94a3b8;">${escapeHTML(email)}</span>
              ${t.bio ? `<span style="font-size:11px; color:#64748b; font-style:italic; margin-top:2px;">"${escapeHTML(t.bio)}"</span>` : ''}
            </div>
          </div>
          ${email !== "comercial.courvanlicitacoes@gmail.com" ? `
            <button onclick="window.removerAnalista('${escapeHTML(email)}')" style="background:none; border:none; color:#f87171; cursor:pointer; font-size:13px; font-weight:500; flex-shrink:0;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
              Remover
            </button>
          ` : ''}
        </div>
      `;
    });
  });
};

window.adicionarNovoAnalista = async function() {
  const nomeInput = document.getElementById("novoTeamNome");
  const emailInput = document.getElementById("novoTeamEmail");
  const senhaInput = document.getElementById("novoTeamSenha");
  const nome = nomeInput ? nomeInput.value.trim() : "";
  const email = emailInput.value.trim().toLowerCase();
  const senha = senhaInput.value;

  if (!nome || !email || !senha) {
    alert("Preencha o nome, e-mail e a senha temporária.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(secondaryAuth, email, senha);
    await setDoc(doc(db, "courvan_team", email), {
      nome, email, bio: "Analista de Licitações"
    }, { merge: true });

    if (nomeInput) nomeInput.value = "";
    emailInput.value = "";
    senhaInput.value = "";
    
    alert("Analista adicionado com sucesso!");
  } catch (error) {
    console.error(error);
    alert("Erro ao adicionar analista: " + error.message);
  }
};

window.removerAnalista = async function(email) {
  const emailLower = email.toLowerCase().trim();
  if (emailLower === "comercial.courvanlicitacoes@gmail.com") {
    alert("Não é possível remover o analista principal.");
    return;
  }
  if (!confirm(`Deseja remover o acesso de ${emailLower}?`)) return;
  
  try {
    await deleteDoc(doc(db, "courvan_team", emailLower));
    alert("Analista removido!");
  } catch (error) {
    console.error(error);
    alert("Erro ao remover: " + error.message);
  }
};

window.logout = async () => {
  if (confirm("Sair do Painel?")) {
    await signOut(auth);
    window.location.href = "login.html";
  }
};
