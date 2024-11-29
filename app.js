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
  // host: 'smtp.office365.com',
  host: 'smtp.gmail.com',
  port: 465,
  //port: 587,
  service: 'gmail',
  secure: true, // Use STARTTLS
  auth: {
      user: 'terrordoflutter@gmail.com',
      // pass: 'pcmsqyebjrleeeyem'  // Ou senha comum se "apps menos seguros" estiver ativado
      pass: 'ysqmpxesktjexyem'
  },
});

// Inicializar o Firebase Admin SDK com a conta de serviço
admin.initializeApp({
  credential: admin.credential.applicationDefault({
  //type: process.env.TYPE,
  project_id: process.env.PROJECT_ID,
  private_key_id: process.env.PRIVATE_KEY_ID,
  private_key: process.env.PRIVATE_KEY.replace(/\n/g, '\n'), // Substitui os \n pelo caractere de nova linha
  client_email: process.env.CLIENT_EMAIL,
  client_id: process.env.CLIENT_ID,
  auth_uri: process.env.AUTH_URI,
  token_uri: process.env.TOKEN_URI,
  auth_provider_x509_cert_url: process.env.AUTH_PROVIDER_X509_CERT_URL,
  client_x509_cert_url: process.env.CLIENT_X509_CERT_URL,
  //universe_domain: process.env.UNIVERSE_DOMAIN,
  }
  )
});

let accessToken = process.env.FIREBASE_ACCESS_TOKEN; // Obtém o token de acesso inicial das variáveis de ambiente
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
    console.error('Erro ao renovar o token de acesso:', error);
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
      // Se o erro for 401 (não autorizado), significa que o token expirou
      console.log('Token expirou, renovando o token...');
      await refreshAccessToken(); // Renova o token de acesso
      await requestFirestore(); // Tenta novamente após renovar o token
    } else {
      console.error('Erro ao acessar o Firestore:', error);
    }
  }
}

// Exemplo de uso
requestFirestore();

const db = admin.firestore(); // Obtém a referência do Firestore

const app = express();
app.use(cors()); // Permite requisições de origens diferentes (CORS)
app.use(express.json()); // Middleware para lidar com JSON

// Rota para adicionar um usuário ao Firestore
app.post("/api/addUser", async (req, res) => {
  const { email, senha, telefone, nome } = req.body;

  if (!email || !senha || !telefone || !nome) {
    return res.status(400).send({ error: "Dados incompletos!" });
  }

  try {
    // Hashear a senha
    const senhaHash = await bcrypt.hash(senha, 10);

    // Adicionar usuário com senha hasheada
    const docRef = await db.collection("usuarios").add({
      email,
      senha: senhaHash, // Salva a senha como hash
      telefone,
      nome,
    });

    res.status(201).send({
      message: "Usuário cadastrado com sucesso!",
      id: docRef.id,
    });
  } catch (error) {
    console.error("Erro ao salvar no Firestore:", error);
    res.status(500).send({ error: "Erro ao salvar no Firestore." });
  }
});

app.put("/api/updatePassword", async (req, res) => {
  const { userId, senhaAtual, novaSenha } = req.body;

  // Validação de dados
  if (!userId || !senhaAtual || !novaSenha) {
    return res.status(400).send({ error: "Dados incompletos!" });
  }

  try {
    // Buscar o usuário pelo userId
    const userDoc = await db.collection("usuarios").doc(userId).get();

    if (!userDoc.exists) {
      return res.status(404).send({ error: "Usuário não encontrado!" });
    }

    // Obter os dados do usuário
    const userData = userDoc.data();

    // Comparar a senha atual com o hash armazenado
    const senhaValida = await bcrypt.compare(senhaAtual, userData.senha);

    if (!senhaValida) {
      return res.status(401).send({ error: "Senha atual incorreta!" });
    }

    // Hashear a nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    // Atualizar a senha no Firestore
    await db.collection("usuarios").doc(userId).update({
      senha: novaSenhaHash,
    });

    return res.status(200).send({ message: "Senha atualizada com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar a senha:", error);
    return res.status(500).send({ error: "Erro interno no servidor." });
  }
});

// Rota para enviar uma senha temporária
app.post("/api/sendTemporaryPassword", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email é obrigatório!" });
  }

  try {
    // Verifica se o e-mail existe no banco de dados
    const userSnapshot = await db
      .collection("usuarios")
      .where("email", "==", email)
      .get();

    if (userSnapshot.empty) {
      return res.status(404).json({ error: "Usuário não encontrado!" });
    }

    const userDoc = userSnapshot.docs[0];
    const userId = userDoc.id;

    // Gera uma senha temporária
    const tempPassword = crypto.randomBytes(6).toString("hex"); // Exemplo: "3f7e2a"
    const tempPasswordHash = await bcrypt.hash(tempPassword, 10);

    // Atualiza a senha temporária no banco
    await db.collection("usuarios").doc(userId).update({
      senha: tempPasswordHash,
    });

    // Envia o e-mail com a senha temporária
    const mailOptions = {
      from: "terrordoflutter@gmail.com",
      to: email,
      subject: "Sua senha temporária",
      text: `Olá, sua senha temporária é: ${tempPassword}. Use-a para acessar sua conta e redefinir sua senha.`,
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: "Senha temporária enviada por e-mail!" });
  } catch (error) {
    console.error("Erro ao enviar senha temporária:", error);
    res.status(500).json({ error: "Erro ao enviar senha temporária." });
  }
});





// Rota para adicionar uma tarefa ao Firestore
app.post("/api/tarefas", async (req, res) => {
  try {
    const { userId, titulo, descricao, horario, status, categoria } = req.body;

    if (!userId || !titulo || !descricao || !horario || !status || !categoria) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios!" });
    }

    const formattedHorario = moment(horario, "DD/MM/YYYY HH:mm").toDate();

    const tarefasRef = db.collection("tarefas");
    const novaTarefa = {
      userId,
      titulo,
      descricao,
      horario: formattedHorario,
      status,
      categoria,
    };

    const docRef = await tarefasRef.add(novaTarefa);
    res.status(201).json({ message: "Tarefa adicionada!", id: docRef.id });
  } catch (error) {
    console.error("Erro ao adicionar tarefa:", error);
    res.status(500).json({ error: "Erro ao adicionar tarefa." });
  }
});

// Rota para listar as tarefas de um usuário
app.get("/api/tarefas/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "O ID do usuário é obrigatório!" });
    }

    const tarefasSnapshot = await db.collection("tarefas").where("userId", "==", userId).get();

    if (tarefasSnapshot.empty) {
      return res.status(404).json({ message: "Nenhuma tarefa encontrada para este usuário." });
    }

    const tarefas = tarefasSnapshot.docs.map((doc) => {
      const tarefaData = doc.data();
      return {
        id: doc.id,
        ...tarefaData,
        horario: moment(tarefaData.horario.toDate()).format("DD/MM/YYYY HH:mm"), // Formata a data
      };
    });

    res.status(200).json(tarefas);
  } catch (error) {
    console.error("Erro ao buscar tarefas:", error);
    res.status(500).json({ error: "Erro ao buscar tarefas." });
  }
});

// Rota para excluir uma tarefa
app.delete("/api/tarefas/:id", async (req, res) => {
  try {
    const { id } = req.params; // ID da tarefa a ser excluída

    // Referência à tarefa no Firestore
    const tarefaRef = db.collection("tarefas").doc(id);
    const tarefa = await tarefaRef.get();

    if (!tarefa.exists) {
      return res.status(404).json({ error: "Tarefa não encontrada!" });
    }

    await tarefaRef.delete();
    res.status(200).json({ message: "Tarefa excluída com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir tarefa:", error);
    res.status(500).json({ error: "Erro ao excluir tarefa." });
  }
});

// Rota para excluir uma tarefa
app.delete("/api/tarefas/:userId/:id", async (req, res) => {
  try {
    const { userId, id } = req.params; // Obtém o userId e o id da tarefa

    // Referência à tarefa no Firestore
    const tarefaRef = db.collection("tarefas").doc(id);
    const tarefa = await tarefaRef.get();

    // Verifica se a tarefa existe e pertence ao usuário
    if (!tarefa.exists || tarefa.data().userId !== userId) {
      return res.status(404).json({ error: "Tarefa não encontrada ou usuário não autorizado!" });
    }

    // Exclui a tarefa
    await tarefaRef.delete();
    res.status(200).json({ message: "Tarefa excluída com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir tarefa:", error);
    res.status(500).json({ error: "Erro ao excluir tarefa." });
  }
});

// Rota para editar uma tarefa
app.put("/api/tarefas/:id", async (req, res) => {
  try {
    const { id } = req.params; // ID da tarefa a ser atualizada
    const { titulo, descricao, horario, status, categoria } = req.body;

    // Verifica se ao menos um campo foi fornecido
    if (!titulo && !descricao && !horario && !status && !categoria) {
      return res.status(400).json({
        error: "Nenhum campo para atualizar foi fornecido!",
        requiredFields: ["titulo", "descricao", "horario", "status", "categoria"],
      });
    }

    // Validação do campo 'horario', se fornecido
    let parsedHorario = null;
    if (horario) {
      if (!moment(horario, "DD/MM/YYYY HH:mm", true).isValid()) {
        return res.status(400).json({ error: "Formato de data/hora inválido! Use DD/MM/YYYY HH:mm." });
      }
      parsedHorario = moment(horario, "DD/MM/YYYY HH:mm").toDate();
    }

    // Construção do objeto de atualizações
    const atualizacoes = {};
    if (titulo) atualizacoes.titulo = titulo;
    if (descricao) atualizacoes.descricao = descricao;
    if (parsedHorario) atualizacoes.horario = parsedHorario;
    if (status) atualizacoes.status = status;
    if (categoria) atualizacoes.categoria = categoria;

    // Verifica se a tarefa existe
    const tarefaRef = db.collection("tarefas").doc(id);
    const tarefa = await tarefaRef.get();

    if (!tarefa.exists) {
      return res.status(404).json({ error: "Tarefa não encontrada!" });
    }

    // Atualiza a tarefa no Firestore
    await tarefaRef.update(atualizacoes);

    // Retorna a resposta com os dados atualizados
    const tarefaAtualizada = (await tarefaRef.get()).data();
    res.status(200).json({
      message: "Tarefa atualizada com sucesso!",
      tarefaAtualizada,
    });
  } catch (error) {
    console.error("Erro ao atualizar tarefa:", error);
    res.status(500).json({ error: "Erro ao atualizar tarefa.", details: error.message });
  }
});

// Rota para adicionar um lembrete ao Firestore (associado a um usuário)
app.post("/api/lembretes", async (req, res) => {
  try {
    const { userId, titulo, descricao, horario } = req.body;

    // Validação de entrada
    if (!userId || !titulo || !descricao || !horario) {
      return res.status(400).json({ error: "Todos os campos são obrigatórios!" });
    }

    // Converte a string de horário recebida no formato "DD/MM/YYYY HH:mm" para um objeto Date
    const formattedHorario = moment(horario, "DD/MM/YYYY HH:mm").toDate();
    if (!formattedHorario ||  isNaN(formattedHorario)) {
      return res.status(400).json({ error: "O formato do horário é inválido." });
    }

    // Salva o lembrete no Firestore
    const lembretesRef = db.collection("lembretes");
    const novoLembrete = {
      userId,
      titulo,
      descricao,
      horario: admin.firestore.Timestamp.fromDate(formattedHorario), // Salva como Timestamp
    };

    const docRef = await lembretesRef.add(novoLembrete);

    // Retorna sucesso com o ID do documento
    res.status(201).json({ message: "Lembrete adicionado com sucesso!", id: docRef.id });
  } catch (error) {
    console.error("Erro ao criar lembrete:", error);
    res.status(500).json({ error: "Erro ao criar lembrete." });
  }
});



// Rota para editar um lembrete no Firestore (associado a um usuário)
app.put("/api/lembretes/:userId/:id", async (req, res) => {
  try {
    const { userId, id } = req.params; // ID do lembrete a ser atualizado e o ID do usuário
    const { titulo, descricao, dataHora } = req.body;

    // Verifica se ao menos um campo foi fornecido para atualização
    if (!titulo && !descricao && !dataHora) {
      return res.status(400).json({ error: "Nenhum campo para atualizar foi fornecido!" });
    }

    // Referência ao lembrete no Firestore
    const lembreteRef = db.collection("lembretes").doc(id);
    const lembrete = await lembreteRef.get();

    // Verifica se o lembrete existe e se pertence ao usuário
    if (!lembrete.exists || lembrete.data().userId !== userId) {
      return res.status(404).json({ error: "Lembrete não encontrado ou usuário não autorizado!" });
    }

    // Cria um objeto para armazenar as atualizações
    const atualizacoes = {};
    if (titulo) atualizacoes.titulo = titulo;
    if (descricao) atualizacoes.descricao = descricao;
    if (dataHora) atualizacoes.dataHora = moment(dataHora, "DD/MM/YYYY HH:mm").toDate();

    // Atualiza o lembrete no Firestore
    await lembreteRef.update(atualizacoes);
    res.status(200).json({ message: "Lembrete atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar lembrete:", error);
    res.status(500).json({ error: "Erro ao atualizar lembrete." });
  }
});

// Rota para editar uma tarefa
app.put("/api/lembretes/:id", async (req, res) => {
  try {
    const { id } = req.params; // ID da tarefa a ser atualizada
    const { titulo, descricao, horario} = req.body;

    // Verifica se ao menos um campo foi fornecido
    if (!titulo && !descricao && !horario) {
      return res.status(400).json({
        error: "Nenhum campo para atualizar foi fornecido!",
        requiredFields: ["titulo", "descricao", "horario"],
      });
    }

    // Validação do campo 'horario', se fornecido
    let parsedHorario = null;
    if (horario) {
      if (!moment(horario, "DD/MM/YYYY HH:mm", true).isValid()) {
        return res.status(400).json({ error: "Formato de data/hora inválido! Use DD/MM/YYYY HH:mm." });
      }
      parsedHorario = moment(horario, "DD/MM/YYYY HH:mm").toDate();
    }

    // Construção do objeto de atualizações
    const atualizacoes = {};
    if (titulo) atualizacoes.titulo = titulo;
    if (descricao) atualizacoes.descricao = descricao;
    if (parsedHorario) atualizacoes.horario = parsedHorario;

    // Verifica se a tarefa existe
    const lembreteRef = db.collection("lembretes").doc(id);
    const lembrete = await lembreteRef.get();

    if (!lembrete.exists) {
      return res.status(404).json({ error: "Lembrete não encontrado!" });
    }

    // Atualiza a tarefa no Firestore
    await lembreteRef.update(atualizacoes);

    // Retorna a resposta com os dados atualizados
    const lembreteAtualizada = (await lembreteRef.get()).data();
    res.status(200).json({
      message: "Lembrete atualizada com sucesso!",
      lembreteAtualizada,
    });
  } catch (error) {
    console.error("Erro ao atualizar lembrete:", error);
    res.status(500).json({ error: "Erro ao atualizar lembrete.", details: error.message });
  }
});

// Rota para excluir um lembrete no Firestore (associado a um usuário)
app.delete("/api/lembretes/:userId/:id", async (req, res) => {
  try {
    const { userId, id } = req.params; // Obtém o userId e o id da tarefa

    // Referência o lembrete no Firestore
    const lembreteRef = db.collection("lembretes").doc(id);
    const lembrete = await lembreteRef.get();

     // Verifica se o lembrete existe e se pertence ao usuário
    if (!lembrete.exists || lembrete.data().userId !== userId) {
      return res.status(404).json({ error: "Lembrete não encontrado ou usuário não autorizado!" });
    }

    // Exclui o lembrete do Firestore
    await lembreteRef.delete();
    res.status(200).json({ message: "Lembrete excluído com sucesso!" });
  } catch (error) {
    console.error("Erro ao excluir lembrete:", error);
    res.status(500).json({ error: "Erro ao excluir lembrete." });
  }
});

// Rota para listar os lembretes de um usuário
app.get("/api/lembretes/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "O ID do usuário é obrigatório!" });
    }

    const lembretesSnapshot = await db.collection("lembretes").where("userId", "==", userId).get();

    if (lembretesSnapshot.empty) {
      return res.status(404).json({ message: "Nenhum lembrete encontrado para este usuário." });
    }

    const lembretes = lembretesSnapshot.docs.map((doc) => {
      const lembreteData = doc.data();
      return {
        id: doc.id,
        ...lembreteData,
        horario: moment(lembreteData.horario.toDate()).format("DD/MM/YYYY HH:mm"), // Formata a data
      };
    });

    res.status(200).json(lembretes);
  } catch (error) {
    console.error("Erro ao buscar lembretes:", error);
    res.status(500).json({ error: "Erro ao buscar lembretes." });
  }
});



// Rota de autenticação (login)
app.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  try {
    const userSnapshot = await db.collection("usuarios").where("email", "==", email).get();

    if (userSnapshot.empty) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const userDoc = userSnapshot.docs[0];
    const userData = userDoc.data();

    // Verifique a senha aqui
    const isPasswordValid = await bcrypt.compare(senha, userData.senha);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const userId = userDoc.id; // Obtendo o userId do documento
    const token = "algum_token_gerado_aqui"; // Gere um token apropriado

    res.status(200).json({ token, id: userId });
  } catch (error) {
    console.error("Erro durante o login:", error);
    res.status(500).json({ error: "Erro no servidor" });
  }
});

// Middleware para interpretar JSON no corpo da requisição
app.use(bodyParser.json());

// Rota de teste
app.get("/", (req, res) => {
  res.send("Bem-vindo ao backend com Node.js e Express!");
});

// Porta do servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
