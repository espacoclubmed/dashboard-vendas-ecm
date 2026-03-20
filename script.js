// ============================================================
// SUPABASE — Inicialização
// ============================================================
// 🔒 ATENÇÃO: Em produção, considere usar variáveis de ambiente
//    ou um backend intermediário para não expor suas credenciais.
//    Com a ANON_KEY exposta no front-end, configure RLS (Row Level Security)
//    no painel do Supabase para proteger seus dados.
const SUPABASE_URL  = 'https://kxawcdvsroapmmxnpffk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YXdjZHZzcm9hcG1teG5wZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzkxMTQsImV4cCI6MjA4OTM1NTExNH0.REuWvVHOhlA2fjbZo7CbRFH16P84Pet238B5OOzeRSM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
const state = {
    consolidado: {},
    vendas: [],
    chartInstances: {},
    fatAnual: 0
};

const MILESTONES = [
    { label: 'Meta 1',       value: 3300000 },
    { label: 'Meta 2',       value: 4300000 },
    { label: 'Feirão 2025',  value: 4375099.76 },
    { label: 'Meta 3',       value: 5000000 },
    { label: 'Meta 4',       value: 6000000 }
];

const chartColors = {
    text: '#486581',
    grid: 'rgba(16,42,67,0.05)',
    navy: '#102A43',
    glacial: '#8FB3D9',
    gold: '#D4AF37'
};

Chart.defaults.color = chartColors.text;
Chart.defaults.font.family = "'Google Sans', 'Open Sans', sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(255,255,255,0.95)';
Chart.defaults.plugins.tooltip.titleColor = chartColors.navy;
Chart.defaults.plugins.tooltip.bodyColor = chartColors.text;
Chart.defaults.plugins.tooltip.titleFont = { family: "'HV Fitzgerald', serif", size: 16 };
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(16,42,67,0.1)';
Chart.defaults.plugins.tooltip.borderWidth = 1;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [resConsolidado, resVendas] = await Promise.all([
            sb.from('consolidado_anual').select('*').limit(1),
            sb.from('vw_dashboard_vendas').select('*')
        ]);

        if (resConsolidado.error) console.warn("Consolidado:", resConsolidado.error);
        if (resVendas.error) throw resVendas.error;

        if (resConsolidado.data && resConsolidado.data.length > 0) {
            state.consolidado = resConsolidado.data[0];
            state.fatAnual = parseFloat(state.consolidado.total_faturamento_anual || 0);
        }
        state.vendas = resVendas.data || [];

        // Set up KPIs from consolidado
        renderConsolidadoKPIs();
        updateGamification();
        populateDropdowns();
        applyFilters();

        // Exemplo: buscar dados da tabela "vendas" (descomentar para testar)
        // await fetchSalesData();

    } catch (error) {
        console.error("Erro:", error);
    } finally {
        setTimeout(() => {
            const l = document.getElementById('globalLoader');
            l.style.opacity = '0';
            setTimeout(() => l.style.display = 'none', 600);
        }, 500);
    }
});

// ============================================================
// EXEMPLO: fetchSalesData()
// Busca dados da tabela "vendas" no Supabase e exibe no console.
// Útil como ponto de partida para integrar novas tabelas.
// ============================================================
async function fetchSalesData() {
    try {
        const { data, error } = await sb
            .from('vendas')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        console.log('📊 Dados da tabela "vendas":', data);
        console.table(data);
        return data;
    } catch (err) {
        console.error('❌ Erro ao buscar vendas:', err.message);
        return [];
    }
}

// ============================================================
// FORMATTER
// ============================================================
function fmtBRL(num) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(num)||0);
}
function fmtCompact(num) {
    const v = parseFloat(num) || 0;
    if (v >= 1000000) return (v/1000000).toFixed(1).replace('.', ',') + 'M';
    if (v >= 1000) return (v/1000).toFixed(0) + 'k';
    return v.toString();
}

// ============================================================
// KPIs FROM CONSOLIDADO_ANUAL (Top Cards, not affected by view filters)
// ============================================================
function renderConsolidadoKPIs() {
    const c = state.consolidado;
    const keys = Object.keys(c);
    const findKey = (partial) => keys.find(k => k.toLowerCase().includes(partial));

    const kFat = findKey('faturamento') || findKey('total');
    const kCom = findKey('comissao') || findKey('comissão');
    const kEqp = findKey('equipamento');
    const kTaxa = findKey('taxa');

    animateValue('kpi-faturamento', 0, parseFloat(c[kFat]) || 0, 1200, true);
    animateValue('kpi-comissao', 0, parseFloat(c[kCom]) || 0, 1200, true);
    animateValue('kpi-equipamentos', 0, parseFloat(c[kEqp]) || 0, 1200, true);
    animateValue('kpi-taxas', 0, parseFloat(c[kTaxa]) || 0, 1200, true);

    // Feirão 2026 — fixed value from consolidado_anual
    const feirao2026 = parseFloat(c.total_feirao_2026) || 0;
    animateValue('kpi-feirao2026', 0, feirao2026, 1200, true);
}

function animateValue(id, start, end, duration, isCurrency) {
    const el = document.getElementById(id);
    let t0 = null;
    const step = (ts) => {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 3);
        const cur = ease * (end - start) + start;
        el.textContent = isCurrency ? fmtBRL(cur) : Math.floor(cur).toLocaleString('pt-BR');
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = isCurrency ? fmtBRL(end) : end.toLocaleString('pt-BR');
    };
    requestAnimationFrame(step);
}

// ============================================================
// GAMIFICATION (uses fatAnual from consolidado_anual)
// ============================================================
function updateGamification() {
    const fat = state.fatAnual;
    const container = document.getElementById('milestonesContainer');
    const fill = document.getElementById('progressFill');
    const badge = document.getElementById('gamiRemaining');
    container.innerHTML = '';

    const maxVal = MILESTONES[MILESTONES.length - 1].value;
    const visMax = maxVal * 1.05;
    const pct = Math.min((fat / visMax) * 100, 100);

    setTimeout(() => { fill.style.width = pct + '%'; }, 400);

    // Find next
    let next = null;
    for (const m of MILESTONES) {
        if (fat < m.value) { next = m; break; }
    }

    if (next) {
        const diff = next.value - fat;
        badge.innerHTML = `Faltam <span>${fmtBRL(diff)}</span> para <strong>${next.label}</strong>`;
    } else {
        badge.innerHTML = '<span style="color:var(--dourado-champagne)">★ Todas as Metas Atingidas!</span>';
    }

    // Draw markers
    MILESTONES.forEach(m => {
        const reached = fat >= m.value;
        const pos = (m.value / visMax) * 100;
        const mk = document.createElement('div');
        mk.className = 'milestone-marker' + (reached ? ' reached' : '');
        mk.style.left = pos + '%';
        mk.innerHTML = `<div class="milestone-label"><div class="milestone-label-title">${m.label}</div><div class="milestone-label-value">${fmtCompact(m.value)}</div></div>`;
        container.appendChild(mk);
    });
}

// ============================================================
// DROPDOWNS
// ============================================================
function populateDropdowns() {
    const campanhas = new Set();
    const origens = new Set();
    state.vendas.forEach(r => {
        const kC = Object.keys(r).find(k => k.toLowerCase().includes('campanha'));
        const kO = Object.keys(r).find(k => k.toLowerCase().includes('origem'));
        if (kC && r[kC]) campanhas.add(String(r[kC]));
        if (kO && r[kO]) origens.add(String(r[kO]));
    });
    const sC = document.getElementById('filtroCampanha');
    Array.from(campanhas).sort().forEach(c => sC.appendChild(new Option(c, c)));
    const sO = document.getElementById('filtroOrigem');
    Array.from(origens).sort().forEach(o => sO.appendChild(new Option(o, o)));
}

// ============================================================
// CORE FILTER → recalculates Transfer card + charts
// ============================================================
function applyFilters() {
    const vC = document.getElementById('filtroCampanha').value;
    const vO = document.getElementById('filtroOrigem').value;

    const filtered = state.vendas.filter(r => {
        const kC = Object.keys(r).find(k => k.toLowerCase().includes('campanha'));
        const kO = Object.keys(r).find(k => k.toLowerCase().includes('origem'));
        const mC = (vC === 'all') || (kC && String(r[kC]) === vC);
        const mO = (vO === 'all') || (kO && String(r[kO]) === vO);
        return mC && mO;
    });

    updateTransferCard(filtered);
    renderCharts(filtered);
}

// ============================================================
// TRANSFER CARD (from filtered view data)
// ============================================================
function updateTransferCard(dataset) {
    let trans = 0;
    dataset.forEach(r => {
        if (r.categoria === 'Transfer') {
            trans += parseFloat(r.valor_total) || 0;
        }
    });
    animateValue('kpi-transfer', 0, trans, 800, true);
}

// ============================================================
// CHARTS
// ============================================================
function createGradient(ctx, c1, c2, horizontal) {
    const g = horizontal ? ctx.createLinearGradient(0,0,800,0) : ctx.createLinearGradient(0,0,0,400);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
}

function renderCharts(dataset) {
    const getCol = (r, p) => Object.keys(r).find(k => k.toLowerCase().includes(p.toLowerCase()));
    const aggVillage = {}, aggCampanha = {}, aggOrigem = {};

    dataset.forEach(r => {
        const campCol = getCol(r, 'campanha');
        const villCol = getCol(r, 'village') || getCol(r, 'destino');
        const origemCol = getCol(r, 'origem');
        const fatCol = getCol(r, 'faturamento') || getCol(r, 'total');

        const camp = campCol && r[campCol] ? r[campCol] : 'Outros';
        const vill = villCol && r[villCol] ? r[villCol] : 'N/I';
        const orig = origemCol && r[origemCol] ? r[origemCol] : 'Direto';
        const fat = fatCol ? (parseFloat(r[fatCol]) || 0) : 0;

        aggVillage[vill] = (aggVillage[vill] || 0) + fat;
        aggCampanha[camp] = (aggCampanha[camp] || 0) + fat;
        aggOrigem[orig] = (aggOrigem[orig] || 0) + fat;
    });

    // --- Village Donut ---
    const vL = Object.keys(aggVillage).sort((a,b) => aggVillage[b]-aggVillage[a]).slice(0,10);
    const vD = vL.map(l => aggVillage[l]);
    const bgDonut = vL.map((_,i) => {
        const r = i / Math.max(vL.length-1,1);
        return `rgba(${16+127*(1-r)},${42+137*(1-r)},${67+150*(1-r)},1)`;
    });
    buildChart('chartVillages', 'doughnut', vL, [{
        data: vD, backgroundColor: bgDonut, borderWidth: 2, borderColor: '#fff', hoverOffset: 6
    }], {
        cutout: '70%',
        plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ' ' + fmtBRL(c.raw) } } }
    });

    // --- Origem Donut (Modern) ---
    const oL = Object.keys(aggOrigem).sort((a,b) => aggOrigem[b]-aggOrigem[a]).slice(0,8);
    const oD = oL.map(l => aggOrigem[l]);
    const paletteOrigem = ['#102A43','#1E3A5C','#336B87','#8FB3D9','#D4AF37','#E8C861','#486581','#6B8EAD'];
    buildChart('chartOrigem', 'doughnut', oL, [{
        data: oD, backgroundColor: paletteOrigem.slice(0, oL.length), borderWidth: 2, borderColor: '#fff', hoverOffset: 6
    }], {
        cutout: '65%',
        plugins: { legend: { position: 'right', labels: { usePointStyle: true, boxWidth: 8 } }, tooltip: { callbacks: { label: c => ' ' + fmtBRL(c.raw) } } }
    });

    // --- Campaigns Horizontal Bar ---
    const cL = Object.keys(aggCampanha).sort((a,b) => aggCampanha[b]-aggCampanha[a]).slice(0,12);
    const cD = cL.map(l => aggCampanha[l]);
    const ctxC = document.getElementById('chartCampanhas').getContext('2d');
    const gH = createGradient(ctxC, chartColors.glacial, chartColors.navy, true);
    buildChart('chartCampanhas', 'bar', cL, [{
        label: 'Faturamento', data: cD, backgroundColor: gH, borderRadius: 4, barThickness: 24, borderWidth: 0
    }], {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + fmtBRL(c.raw) } } },
        scales: { x: { grid: { color: chartColors.grid }, ticks: { callback: v => 'R$ '+(v/1000)+'k' } }, y: { grid: { display: false } } }
    });
}

function buildChart(id, type, labels, datasets, options) {
    const ctx = document.getElementById(id).getContext('2d');
    if (state.chartInstances[id]) state.chartInstances[id].destroy();
    state.chartInstances[id] = new Chart(ctx, {
        type, data: { labels, datasets },
        options: Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 800, easing: 'easeOutQuart' } }, options)
    });
}
