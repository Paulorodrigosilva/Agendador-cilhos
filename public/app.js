// Configuração da MongoDB Data API
const MONGODB_CONFIG = {
  // ATENÇÃO: Substitua abaixo pela sua URL correta do Endpoint da Data API obtida no painel do Atlas
  endpoint: "https://us-east-1.data.mongodb-api.com/app/data-xxxxx/endpoint/data/v1", 
  apiKey: "al-zMj5QLeu1LFPt6NQxFC3NWNihfS4y8vxth0K4rbtXke",
  dataSource: "Cluster0",
  database: "studio_db" 
};

// Função genérica para comunicar com o MongoDB Atlas via Data API
async function mongoQuery(collection, action, filter = {}, document = {}, update = {}) {
  const url = `${MONGODB_CONFIG.endpoint}/action/${action}`;
  const body = {
    dataSource: MONGODB_CONFIG.dataSource,
    database: MONGODB_CONFIG.database,
    collection: collection,
    ...Object.keys(filter).length && { filter },
    ...Object.keys(document).length && { document },
    ...Object.keys(update).length && { update }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Request-Headers": "*",
        "api-key": MONGODB_CONFIG.apiKey
      },
      body: JSON.stringify(body)
    });
    return await response.json();
  } catch (error) {
    console.error("Erro na requisição ao MongoDB:", error);
    return null;
  }
}

const authScreen = document.querySelector('#auth-screen');
const appScreen = document.querySelector('#app-screen');
const authForm = document.querySelector('#auth-form');
const authMessage = document.querySelector('#auth-message');
const serviceSelect = document.querySelector('#service-select');
const appointmentForm = document.querySelector('#appointment-form');
const appointmentMessage = document.querySelector('#appointment-message');
const appointmentsList = document.querySelector('#appointment-list');
const emptyState = document.querySelector('#empty-state');
const serviceForm = document.querySelector('#service-form');
const dateStartFilter = document.querySelector('#date-start-filter');
const dateEndFilter = document.querySelector('#date-end-filter');

let currentUser = null;
let services = [];
let appointments = [];
let users = [];
let authMode = 'login';
let toastTimer;

// Carregar dados iniciais do banco ao abrir a página
async function initDatabaseData() {
  const srvRes = await mongoQuery("services", "find", {});
  if (srvRes && srvRes.documents && srvRes.documents.length > 0) {
    services = srvRes.documents;
  } else {
    // Insere os padrões caso a collection esteja vazia
    services = [
      { id: 1, nome: 'Extensão Volume Russo', valor: 120.00, duracao_minutos: 90 },
      { id: 2, nome: 'Lash Lifting', valor: 90.00, duracao_minutos: 60 }
    ];
    for (const s of services) {
      await mongoQuery("services", "insertOne", {}, s);
    }
  }

  const appRes = await mongoQuery("appointments", "find", {});
  if (appRes && appRes.documents) appointments = appRes.documents;

  const usrRes = await mongoQuery("users", "find", {});
  if (usrRes && usrRes.documents) users = usrRes.documents;

  renderServices();
}
initDatabaseData();

function setMessage(element, text, success = false) {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('is-success', success);
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return new Intl.DateTimeFormat('pt-BR', options).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function showAuth(mode = 'login') {
  authMode = mode;
  const registering = mode === 'register';
  const nameField = document.querySelector('#name-field');
  if (nameField) {
    nameField.hidden = !registering;
    nameField.querySelector('input').required = registering;
  }
  document.querySelector('#auth-eyebrow').textContent = registering ? 'NOVO POR AQUI?' : 'BEM-VINDA AO STUDIO';
  document.querySelector('#auth-title').textContent = registering ? 'Crie sua conta' : 'Acesse sua conta';
  document.querySelector('#auth-description').textContent = registering
    ? 'Cadastre-se para agendar seus horários com facilidade.'
    : 'Entre para consultar sua agenda ou marcar um procedimento.';
  document.querySelector('#auth-submit').innerHTML = registering
    ? 'Cadastrar <span aria-hidden="true">↗</span>'
    : 'Entrar <span aria-hidden="true">↗</span>';
  document.querySelectorAll('[data-auth-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.authMode === mode);
  });
  setMessage(authMessage, '');
}

function renderApp() {
  const isMaster = currentUser.tipo === 'master';
  authScreen.hidden = true;
  appScreen.hidden = false;
  document.querySelector('#account-name').textContent = currentUser.nome;
  document.querySelector('#account-avatar').textContent = currentUser.nome.trim().charAt(0).toUpperCase();
  document.querySelector('#account-role').textContent = isMaster ? 'Profissional Master' : 'Cliente';
  document.querySelectorAll('.admin-only').forEach((element) => { element.hidden = !isMaster; });
  document.querySelector('#today-label').textContent = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'long'
  }).format(new Date());
}

function renderServices() {
  if (!serviceSelect) return;
  const selected = serviceSelect.value;
  serviceSelect.innerHTML = '<option value="">Selecione um procedimento</option>' + services.map((service) => {
    const label = `${service.nome} — ${formatCurrency(service.valor)}`;
    return `<option value="${service.id || service._id}">${escapeHtml(label)} (${service.duracao_minutos} min)</option>`;
  }).join('');
  if (services.some((service) => String(service.id || service._id) === selected)) serviceSelect.value = selected;
  const statServices = document.querySelector('#stat-services');
  if (statServices) statServices.textContent = services.length;
  renderServiceList();
}

function renderAppointments() {
  if (!appointmentsList) return;
  const filter = document.querySelector('#appointment-filter')?.value || 'todos';
  const filtered = appointments.filter((item) => filter === 'todos' || item.servico_id == filter);
  const now = Date.now();
  const upcoming = appointments.filter((item) => new Date(item.data_hora).getTime() >= now)
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
  
  const ownCount = appointments.filter((item) => item.usuario_id === currentUser.id).length;
  document.querySelector('#stat-mine').textContent = ownCount;
  document.querySelector('#stat-next').textContent = upcoming[0] ? formatDate(upcoming[0].data_hora) : '—';
  document.querySelector('#stat-next-detail').textContent = upcoming[0]
    ? `${formatTime(upcoming[0].data_hora)} · ${upcoming[0].servico_nome}` : 'Nenhum agendamento futuro';

  appointmentsList.innerHTML = filtered.map((item) => {
    const start = new Date(item.data_hora);
    const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(start).replace('.', '');
    const canCancel = currentUser.tipo === 'master' || item.usuario_id === currentUser.id;
    
    return `<article class="reservation-item">
      <div class="date-tile"><strong>${String(start.getDate()).padStart(2, '0')}</strong><span>${escapeHtml(month)}</span></div>
      <div class="reservation-main">
        <div class="reservation-title-row">
          <strong class="reservation-title">${escapeHtml(item.servico_nome)}</strong>
          <span class="type-tag">${formatCurrency(item.valor)}</span>
        </div>
        <p class="reservation-time">Horário: ${formatDate(item.data_hora, { day: '2-digit', month: 'short', year: 'numeric' })} às ${formatTime(item.data_hora)}</p>
        <span class="reservation-owner">Cliente: ${escapeHtml(item.usuario_nome)}</span>
      </div>
      <div class="reservation-actions">
        ${canCancel ? `<button class="cancel-button" type="button" data-cancel-appointment="${item.id}" title="Cancelar horário">×</button>` : ''}
      </div>
    </article>`;
  }).join('');
  if (emptyState) emptyState.hidden = filtered.length > 0;
}

function renderServiceList() {
  const list = document.querySelector('#service-list');
  if (!list || currentUser?.tipo !== 'master') return;
  list.innerHTML = services.map((service) => `<div class="management-row">
    <span class="row-symbol">✨</span>
    <div class="row-copy">
      <strong>${escapeHtml(service.nome)}</strong>
      <span>${formatCurrency(service.valor)} · ${service.duracao_minutos} minutos</span>
    </div>
    <div class="management-actions">
      <button class="row-delete" type="button" data-delete-service="${service.id || service._id}" title="Excluir serviço">×</button>
    </div>
  </div>`).join('');
}

async function loadDashboard() {
  const srvRes = await mongoQuery("services", "find", {});
  if (srvRes && srvRes.documents) services = srvRes.documents;

  const appRes = await mongoQuery("appointments", "find", {});
  if (appRes && appRes.documents) appointments = appRes.documents;

  renderServices();
  renderAppointments();
}

// Eventos de Autenticação (Login e Cadastro)
document.querySelectorAll('[data-auth-mode]').forEach((button) => {
  button.addEventListener('click', () => showAuth(button.dataset.authMode));
});

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(authForm);
  const data = Object.fromEntries(formData);
  const submit = document.querySelector('#auth-submit');
  submit.disabled = true;
  setMessage(authMessage, '');

  try {
    const usrRes = await mongoQuery("users", "find", {});
    if (usrRes && usrRes.documents) users = usrRes.documents;

    if (authMode === 'register') {
      const existe = users.find((u) => u.email.toLowerCase() === data.email.toLowerCase());
      if (existe) throw new Error('Este e-mail já está cadastrado.');

      const novoUsuario = {
        id: 'user-' + Date.now(),
        nome: data.nome,
        email: data.email,
        senha: data.senha,
        tipo: 'cliente'
      };
      
      await mongoQuery("users", "insertOne", {}, novoUsuario);
      users.push(novoUsuario);

      authForm.reset();
      showAuth('login');
      setMessage(authMessage, 'Cadastro realizado com sucesso! Faça seu login.', true);
    } else {
      const usuarioEncontrado = users.find(
        (u) => u.email.toLowerCase() === data.email.toLowerCase() && u.senha === data.senha
      );

      if (data.email.trim().toLowerCase() === 'prodrigosilvacel@gmail.com' && data.senha === 'w118187') {
        currentUser = { id: 'admin-master', nome: 'Rodrigo Silva', email: 'prodrigosilvacel@gmail.com', tipo: 'master' };
      } else if (usuarioEncontrado) {
        currentUser = usuarioEncontrado;
      } else {
        throw new Error('E-mail ou senha incorretos.');
      }

      renderApp();
      await loadDashboard();
      showToast('Bem-vindo ao sistema!');
    }
  } catch (error) {
    setMessage(authMessage, error.message);
  } finally {
    submit.disabled = false;
  }
});

// Controle de Abas
document.querySelectorAll('.main-nav button[data-view], .nav-link[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const viewName = button.dataset.view;
    document.querySelectorAll('.main-nav button, .nav-link').forEach((btn) => btn.classList.remove('is-active'));
    button.classList.add('is-active');

    document.querySelectorAll('.view-panel').forEach((panel) => {
      const isTarget = panel.id === `${viewName}-view`;
      panel.hidden = !isTarget;
      panel.classList.toggle('is-visible', isTarget);
    });
  });
});

// Logout
document.querySelector('#logout-button')?.addEventListener('click', () => {
  currentUser = null;
  appScreen.hidden = true;
  authScreen.hidden = false;
  authForm.reset();
  showAuth('login');
  showToast('Sessão encerrada.');
});

// Criar Agendamento
appointmentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(appointmentForm);
  const data = Object.fromEntries(formData);
  const servicoObj = services.find(s => (s.id == data.servico_id || s._id == data.servico_id));

  if (!servicoObj) {
    setMessage(appointmentMessage, 'Selecione um procedimento válido.');
    return;
  }

  const novoAgendamento = {
    id: 'ag-' + Date.now(),
    servico_id: data.servico_id,
    servico_nome: servicoObj.nome,
    valor: servicoObj.valor,
    data_hora: data.data_hora,
    usuario_id: currentUser.id,
    usuario_nome: currentUser.nome
  };

  await mongoQuery("appointments", "insertOne", {}, novoAgendamento);
  appointments.push(novoAgendamento);

  appointmentForm.reset();
  showToast('Agendamento realizado com sucesso!');
  await loadDashboard();
});

// Cadastrar Serviço (Painel Master)
serviceForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(serviceForm);
  const data = Object.fromEntries(formData);
  const serviceMsg = document.querySelector('#service-message');

  const novoServico = {
    id: 'srv-' + Date.now(),
    nome: data.nome,
    valor: parseFloat(data.valor),
    duracao_minutos: parseInt(data.duracao_minutos, 10
