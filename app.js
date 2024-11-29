// Importações necessárias
const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const jwt = require("jsonwebtoken");
const moment = require("moment"); // Adicionando moment.js para formatação de datas
const axios = require('axios');

// EMAIL with Nodemailer
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

// Configuração do Nodemailer
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  service: 'gmail',
  secure: true, // Usa SSL
  auth: {
    user: 'terrordoflutter@gmail.com',
    pass: process.env.EMAIL_PASSWORD
  },
});

// Verificação das variáveis de ambiente
const requiredEnvVars = [
  'TYPE',
  'PROJECT_ID',
  'PRIVATE_KEY_ID',
  'PRIVATE_KEY',
  'CLIENT_EMAIL',
  'CLIENT_ID',
  'AUTH_URI',
  'TOKEN_URI',
  'AUTH_PROVIDER_X509_CERT_URL',
  'CLIENT_X509_CERT_URL',
  'FIREBASE_CLIENT_ID',
  'FIREBASE_CLIENT_SECRET',
  'FIREBASE_PROJECT_ID'
];

requiredEnvVars.forEach((envVar) => {
  if (!process.env[envVar]) {
    console.error(`Erro: A variável de ambiente ${envVar} não está definida.`);
    process.exit(1);
  }
});

// Inicializar o Firebase Admin SDK com a conta de serviço
admin.initializeApp({
  credential: admin.credential.cert({
    type: process.env.TYPE,
    project_id: process.env.PROJECT_ID,
    private_key_id: process.env.PRIVATE_KEY_ID,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.CLIENT_EMAIL,
    client_id: process.env.CLIENT_ID,
    auth_uri: process.env.AUTH_URI,
    token_uri: process.env.TOKEN_URI,
    auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
    client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
    universe_domain: process.env.UNIVERSE_DOMAIN,
  })
});

let accessToken = process.env.FIREBASE_ACCESS_TOKEN;
const refreshToken = process.env.FIREBASE_REFRESH_TOKEN;

// Função para obter um novo token de acesso usando o token de atualização
async function refreshAccessToken() {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.FIREBASE_CLIENT_ID,
      client_secret: process.env.FIREBASE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
    accessToken = response.data.access_token; // Atualiza o token de acesso
    console.log('Novo token de acesso gerado:', accessToken);
  } catch (error) {
    console.error('Erro ao renovar o token de acesso:', JSON.stringify(error.response ? error.response.data : error.message, null, 2));
  }
}

// Função para fazer uma solicitação ao Firestore usando o token de acesso
async function requestFirestore() {
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${process.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/your_collection`;

  try {
    const response = await axios.get(firestoreUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log(response.data);
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('Token expirou, renovando o token...');
      await refreshAccessToken(); // Renova o token de acesso
      await requestFirestore(); // Tenta novamente após renovar o token
    } else {
      console.error('Erro ao acessar o Firestore:', JSON.stringify(error.response ? error.response.data : error.message, null, 2));
    }
  }
}

// Exemplo de uso
requestFirestore();

const db = admin.firestore(); // Obtém a referência do Firestore

const app = express();
app.use(cors()); // Permite requisições de origens diferentes (CORS)
app.use(express.json()); // Middleware para lidar com JSON

// Middleware para interpretar JSON no corpo da requisição
app.use(bodyParser.json());

// Rota de teste
app.get("/", (req, res) => {
  res.send("Bem-vindo ao backend com Node.js e Express!");
});

// Porta do servidor
const PORT = process.env.PORT || 3000;

// Verifica se a porta está disponível e cria o servidor
app.listen(PORT, (error) => {
  if (error) {
    console.error(`Erro ao iniciar o servidor: ${error.message}`);
    if (error.code === 'EADDRINUSE') {
      console.error(`A porta ${PORT} já está em uso. Tente usar uma porta diferente.`);
    }
    process.exit(1);
  } else {
    console.log(`Servidor rodando na porta ${PORT}`);
  }
});

// Rota para adicionar um usuário ao Firestore
app.post("/api/addUser", async (req, res) => {
  const { email, senha, telefone, nome } = req.body;

  if (!email || !senha || !telefone || !nome) {
    return res.status(400).send({ error: "Dados incompletos!" });
  }

  try {
    const senhaHash = await bcrypt.hash(senha, 10);
    const docRef = await db.collection("usuarios").add({
      email,
      senha: senhaHash,
      telefone,
      nome,
    });

    res.status(201).send({
      message: "Usuário cadastrado com sucesso!",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Erro ao salvar no Firestore:", JSON.stringify(error.response ? error.response.data : error.message, null, 2));
    res.status(500).send({ error: "Erro ao salvar no Firestore." });
  }
});