import express from "express";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import { createRequire } from "module";
import admin from "firebase-admin";

const require = createRequire(import.meta.url);
const app = express();
const PORT = 3000;

let firebaseAdminDb: any = null;

function getFirebaseAdminDb() {
  if (!firebaseAdminDb) {
    const serviceAccountVar = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountVar) {
      try {
        const serviceAccount = JSON.parse(serviceAccountVar);
        if (admin.apps.length === 0) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
          });
        }
        firebaseAdminDb = admin.firestore();
      } catch (err) {
        console.error("Error initializing Firebase Admin:", err);
      }
    } else {
      console.warn("FIREBASE_SERVICE_ACCOUNT env var is not set.");
    }
  }
  return firebaseAdminDb;
}

// Log requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware for parsing JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve content list for the blog index
app.get("/content/posts", (req, res) => {
  const postsPath = path.join(process.cwd(), "content", "posts");
  if (fs.existsSync(postsPath)) {
    fs.readdir(postsPath, (err, files) => {
      if (err) {
        res.status(500).send("Error reading posts directory");
        return;
      }
      // Return simple HTML list of files so the client DOMParser can parse it
      const links = files
        .filter(file => file.endsWith(".json"))
        .map(file => `<a href="/content/posts/${file}">${file}</a>`)
        .join("\n");
      res.send(`<html><body>${links}</body></html>`);
    });
  } else {
    res.send("<html><body></body></html>");
  }
});

// Serve individual posts statically if needed
app.use("/content/posts", express.static(path.join(process.cwd(), "content", "posts")));

// Endpoint to run the radar (trigger buscarLicitacoes from radar.js)
app.get("/api/run-radar", (req, res) => {
  console.log("Triggered radar execution via API...");
  exec("node radar.js", (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      res.status(500).json({ success: false, error: error.message, stderr });
      return;
    }
    res.json({ success: true, stdout, stderr });
  });
});

// Dynamic iCalendar subscription feed for cloud calendars (Google, Outlook, etc.)
app.get("/api/feed/:clienteId", async (req, res) => {
  const { clienteId } = req.params;
  const dbAdmin = getFirebaseAdminDb();
  
  if (!dbAdmin) {
    res.status(500).send("Database not configured");
    return;
  }
  
  try {
    const isGeral = clienteId === "admin" || clienteId === "geral";
    
    // Fetch all clients to map their names and handle company grouping
    const todosClientesSnap = await dbAdmin.collection("clientes").get();
    const clientesMap: Record<string, string> = {};
    todosClientesSnap.forEach((docItem: any) => {
      clientesMap[docItem.id] = docItem.data()?.nome || "Desconhecido";
    });

    let clientIds = [clienteId];
    let clienteNome = isGeral ? "Geral Admin" : "Cliente";

    if (!isGeral) {
      const clienteDoc = await dbAdmin.collection("clientes").doc(clienteId).get();
      if (clienteDoc.exists) {
        const clienteData = clienteDoc.data();
        clienteNome = clienteData?.nome || "Cliente";
        const nomeEmpresa = (clienteData?.empresa || "").trim();
        if (nomeEmpresa) {
          const docsMesmaEmpresa = todosClientesSnap.docs.filter((d: any) => {
            const emp = (d.data().empresa || "").trim();
            return emp.toLowerCase() === nomeEmpresa.toLowerCase();
          });
          if (docsMesmaEmpresa.length > 0) {
            clientIds = docsMesmaEmpresa.map((d: any) => d.id);
            clienteNome = nomeEmpresa;
          }
        }
      }
    }

    // Query active licitacoes
    let licQuery: any = dbAdmin.collection("licitacoes");
    if (!isGeral) {
      if (clientIds.length === 1) {
        licQuery = licQuery.where("clienteId", "==", clientIds[0]);
      } else {
        licQuery = licQuery.where("clienteId", "in", clientIds);
      }
    }
    licQuery = licQuery.where("status", "in", ["aviso", "andamento", "vencida", "perdida"]);
    const licSnap = await licQuery.get();
      
    // Query documentos
    let docQuery: any = dbAdmin.collection("documentos");
    if (!isGeral) {
      if (clientIds.length === 1) {
        docQuery = docQuery.where("clienteId", "==", clientIds[0]);
      } else {
        docQuery = docQuery.where("clienteId", "in", clientIds);
      }
    }
    const docSnap = await docQuery.get();
      
    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Courvan//Courvan Agenda//PT\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:Courvan - " + clienteNome + "\r\nX-WR-TIMEZONE:America/Sao_Paulo\r\nX-PUBLISHED-TTL:PT15M\r\nREFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n";
    
    // Process licitacoes
    licSnap.forEach((docItem: any) => {
      const l = docItem.data();
      if (!l.dataSessao) return;
      
      const uid = docItem.id + "@courvan.com.br";
      const eventClienteNome = clientesMap[l.clienteId] || clienteNome;
      const summary = `Licitação: ${l.orgao || "Órgão"}`;
      const description = `Objeto: ${l.objeto || ""}\\nValor: ${l.valor || ""}\\nStatus: ${l.status || ""}\\nCliente: ${eventClienteNome}`;
      
      let dateStr = l.dataSessao;
      let ymd = "";
      if (dateStr.includes("/")) {
        ymd = dateStr.split("/").reverse().join("");
      } else {
        ymd = dateStr.replace(/-/g, "").substring(0, 8);
      }
      
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:${uid}\r\n`;
      icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\n`;
      icsContent += `DTSTART;VALUE=DATE:${ymd}\r\n`;
      icsContent += `SUMMARY:${summary.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += `DESCRIPTION:${description.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += "END:VEVENT\r\n";
    });
    
    // Process documentos
    docSnap.forEach((docItem: any) => {
      const d = docItem.data();
      if (!d.vencimento) return;
      
      const uid = docItem.id + "@courvan.com.br";
      const eventClienteNome = clientesMap[d.clienteId] || clienteNome;
      const summary = `📄 Vencimento: ${d.nome || "Documento"}`;
      const description = `Categoria: ${d.categoria || ""}\\nStatus do Documento: ${d.statusDocumento || ""}\\nCliente: ${eventClienteNome}`;
      
      let dateStr = d.vencimento; // Expecting YYYY-MM-DD
      const ymd = dateStr.replace(/-/g, "").substring(0, 8);
      
      icsContent += "BEGIN:VEVENT\r\n";
      icsContent += `UID:${uid}\r\n`;
      icsContent += `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z\r\n`;
      icsContent += `DTSTART;VALUE=DATE:${ymd}\r\n`;
      icsContent += `SUMMARY:${summary.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += `DESCRIPTION:${description.replace(/,/g, "\\,").replace(/;/g, "\\;")}\r\n`;
      icsContent += "END:VEVENT\r\n";
    });
    
    icsContent += "END:VCALENDAR\r\n";
    
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Disposition", `inline; filename="agenda_${clienteId}.ics"`);
    res.status(200).send(icsContent);
  } catch (error: any) {
    console.error("Error generating ICS feed:", error);
    res.status(500).send("Error generating calendar feed");
  }
});

// Serve static files
const publicDir = process.env.NODE_ENV === "production" 
  ? path.join(process.cwd(), "dist")
  : process.cwd();

// Serve assets, admin, blog, etc.
app.use(express.static(publicDir));

// Fallback to index.html for root path or HTML-expecting requests
app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode`);
});
