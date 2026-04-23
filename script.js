// ============================================================
// ESPAÇO CLUB MED — Dashboard de Vendas (L'Espace Raffiné)
// Lógica de dados preservada: consolidado_anual, vw_dashboard_vendas,
// vw_village_resumo, vw_filtros_dashboard + realtime + slideshow.
// ============================================================

const SUPABASE_URL  = 'https://kxawcdvsroapmmxnpffk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4YXdjZHZzcm9hcG1teG5wZmZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NzkxMTQsImV4cCI6MjA4OTM1NTExNH0.REuWvVHOhlA2fjbZo7CbRFH16P84Pet238B5OOzeRSM';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// STATE
// ============================================================
const state = {
    consolidado: {},
    vendas: [],
    filtrados: [],
    villageResumo: [],
    chartInstances: {},
    fatAnualGlobal: 0,
    fatFeiraoGlobal: 0,
    milestones: []
};

// Paleta L'Espace Raffiné
const palette = {
    secondary:  '#13333d',
    primary:    '#476273',
    primaryCt:  '#b2cee2',
    tertiary:   '#5d6301',
    tertiaryCt: '#d1d871',
    outline:    '#73787c',
    surface:    '#efedef',
    text:       '#1a1c1d',
    textVar:    '#42474c',
    grid:       'rgba(19,51,61,0.08)',
    glacial:    '#b2cee2',
    gold:       '#d1d871'
};

const categoricalColors = [
    '#13333d', '#476273', '#b2cee2', '#d1d871',
    '#5d6301', '#73787c', '#3d5869', '#aecade',
    '#c6cd67', '#42474c'
];

// Chart.js defaults
Chart.defaults.color = palette.textVar;
Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 13;
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(255,255,255,0.98)';
Chart.defaults.plugins.tooltip.titleColor = palette.secondary;
Chart.defaults.plugins.tooltip.bodyColor = palette.textVar;
Chart.defaults.plugins.tooltip.titleFont = { family: "'Inter', system-ui", size: 14, weight: '600' };
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(19,51,61,0.08)';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.cornerRadius = 12;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [resConsolidado, resVendas, resVillage, resSellers] = await Promise.all([
            sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
            sb.from('vw_dashboard_vendas').select('*'),
            sb.from('vw_village_resumo').select('*'),
            sb.from('vendas_reservas').select('vendedora, valor_total').not('vendedora', 'is', null)
        ]);

        if (resConsolidado.error) console.warn("Consolidado:", resConsolidado.error);
        if (resVendas.error) throw resVendas.error;
        if (resVillage.error) console.warn("Village resumo:", resVillage.error);
        if (resSellers.error) console.warn("Sellers:", resSellers.error);

        state.consolidado = resConsolidado.data || {};
        state.vendas = resVendas.data || [];
        state.villageResumo = resVillage.data || [];
        state.sellersRaw = resSellers.data || [];
        state.fatAnualGlobal = parseFloat(state.consolidado.total_faturamento_anual || 0);
        state.fatFeiraoGlobal = parseFloat(state.consolidado.total_feirao_2026 || 0);

        buildMilestones();
        updateGamification();
        await populateDropdowns();
        drawFixedKPIs();
        renderTopSellers(state.filtrados);
        await applyFilters();
        initUltimaVenda();

    } catch (error) {
        console.error("Erro crítico:", error);
    } finally {
        setTimeout(() => {
            const l = document.getElementById('globalLoader');
            if (l) { l.style.opacity = '0'; setTimeout(() => l.style.display = 'none', 600); }
        }, 600);
    }

    // Realtime
    sb.channel('consolidado_changes')
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'consolidado_anual' },
          silentRefresh)
      .subscribe();

    // Fallback a cada 5 minutos
    setInterval(silentRefresh, 5 * 60 * 1000);
    // Timestamp a cada 60s
    setInterval(updateTimestamp, 60 * 1000);
    updateTimestamp();
});

// ============================================================
// UTILS
// ============================================================
function fmtBRL(num) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parseFloat(num) || 0);
}
function fmtCompact(num) {
    const v = parseFloat(num) || 0;
    if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M';
    if (v >= 1000)    return 'R$ ' + (v / 1000).toFixed(0) + 'k';
    return fmtBRL(v);
}
function findKey(obj, ...partials) {
    const keys = Object.keys(obj || {});
    for (const p of partials) {
        const k = keys.find(k => k.toLowerCase().includes(p.toLowerCase()));
        if (k) return k;
    }
    return null;
}

function buildMilestones() {
    state.milestones = [
        { label: 'Meta 1',      value: 3300000 },
        { label: 'Meta 2',      value: 4300000 },
        { label: 'Feirão 2025', value: 4375099.76, special: true },
        { label: 'Meta 3',      value: 5000000 },
        { label: 'Meta Anual',  value: 6000000 },
        { label: '👑 Meta Ouro', value: 8000000, crown: true }
    ].sort((a, b) => a.value - b.value);
}

// ============================================================
// PROGRESS / GAMIFICATION  — usa receita anual acumulada
// ============================================================
function updateGamification() {
    const fat = state.fatAnualGlobal;
    const container = document.getElementById('milestonesContainer');
    const fill = document.getElementById('progressFill');
    const badge = document.getElementById('gamiRemaining');
    if (!container || !fill || !badge) return;

    container.innerHTML = '';
    const maxVal = state.milestones[state.milestones.length - 1].value;
    const pct = Math.min((fat / maxVal) * 100, 100);

    setTimeout(() => { fill.style.width = pct + '%'; }, 400);

    const next = state.milestones.find(m => fat < m.value);
    if (next) {
        const diff = next.value - fat;
        badge.innerHTML = `Faltam <strong>${fmtCompact(diff)}</strong> para ${next.label}`;
    } else {
        badge.innerHTML = '★ Todas as metas atingidas';
    }

    state.milestones.forEach((m, i) => {
        const reached = fat >= m.value;
        const pos = Math.min((m.value / maxVal) * 100, 100);
        const mk = document.createElement('div');
        // Alterna labels acima/abaixo para não sobrepor
        const placement = (i % 2 === 0) ? 'label-below' : 'label-above';
        mk.className = `milestone-marker ${placement}` + (reached ? ' reached' : '') + (m.special ? ' special' : '') + (m.crown ? ' crown' : '');
        mk.style.left = pos + '%';
        mk.innerHTML = `
            <span class="milestone-dot"></span>
            <div class="milestone-label">
                <div class="milestone-label-title">${m.label}</div>
                <div class="milestone-label-value">${fmtCompact(m.value)}</div>
            </div>`;
        mk.setAttribute('tabindex', '0');
        mk.addEventListener('click', (e) => {
            container.querySelectorAll('.milestone-marker.active-touch').forEach(el => {
                if (el !== mk) el.classList.remove('active-touch');
            });
            mk.classList.toggle('active-touch');
            e.stopPropagation();
        });
        container.appendChild(mk);
    });
    if (!window._milestoneOutsideListener) {
        document.addEventListener('click', () => {
            document.querySelectorAll('.milestone-marker.active-touch').forEach(el => el.classList.remove('active-touch'));
        });
        window._milestoneOutsideListener = true;
    }
}

// ============================================================
// FILTERS (server-side)
// ============================================================
async function populateDropdowns() {
    let campanhas = new Set(), origens = new Set(), meses = new Set(), villages = new Set();

    const { data, error } = await sb.from('vw_filtros_dashboard').select('*');
    if (!error && data) {
        data.forEach(r => {
            if (r.campanha) campanhas.add(String(r.campanha));
            if (r.origem)   origens.add(String(r.origem));
            if (r.mes_ano)  meses.add(String(r.mes_ano));
        });
    } else {
        // Fallback: extrai dos próprios dados de vendas
        state.vendas.forEach(r => {
            if (r.campanha) campanhas.add(String(r.campanha));
            if (r.origem)   origens.add(String(r.origem));
            if (r.mes_ano)  meses.add(String(r.mes_ano));
        });
    }
    state.vendas.forEach(r => { if (r.village) villages.add(String(r.village)); });

    const fill = (id, placeholder, values, sortFn) => {
        const sel = document.getElementById(id);
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = `<option value="all">${placeholder}</option>`;
        const arr = Array.from(values);
        if (sortFn) arr.sort(sortFn); else arr.sort();
        arr.forEach(v => sel.appendChild(new Option(v, v)));
        if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
    };

    fill('filtroCampanha', 'Campanha: Todas', campanhas);
    fill('filtroOrigem',   'Origem: Todas',   origens);
    fill('filtroMes',      'Mês: Todos',      meses);
    fill('filtroVillage',  'Village: Todos',  villages);
}

async function applyFilters() {
    const vC = document.getElementById('filtroCampanha')?.value || 'all';
    const vO = document.getElementById('filtroOrigem')?.value   || 'all';
    const vM = document.getElementById('filtroMes')?.value      || 'all';
    const vV = document.getElementById('filtroVillage')?.value  || 'all';

    let query = sb.from('vw_dashboard_vendas').select('*');
    if (vC !== 'all') query = query.eq('campanha', vC);
    if (vO !== 'all') query = query.eq('origem',   vO);
    if (vM !== 'all') query = query.eq('mes_ano',  vM);
    if (vV !== 'all') query = query.eq('village',  vV);

    const { data, error } = await query;
    if (error) { console.error('Erro ao aplicar filtros:', error); return; }

    state.filtrados = data || [];
    recalcFilteredKPIs(state.filtrados);
    renderCharts(state.filtrados);
    renderTopSellers(state.filtrados);
}

// ============================================================
// KPIs CONSOLIDADOS (não afetados pelos filtros)
// ============================================================
function drawFixedKPIs() {
    const c = state.consolidado;
    const fat       = parseFloat(c.total_faturamento_anual)  || 0;
    const fatFeirao = parseFloat(c.total_feirao_2026)        || 0;

    // Feirão de Neve: tenta coluna específica, cai de volta para total_feirao_2026
    const kNeve    = findKey(c, 'feirao_neve', 'feirão_neve', 'neve');
    const feiraoNeve = kNeve ? (parseFloat(c[kNeve]) || 0) : fatFeirao;

    // Hot Sales: coluna específica, senão 0
    const kHot = findKey(c, 'hot_sales', 'hotsales', 'hot');
    const hotSales = kHot ? (parseFloat(c[kHot]) || 0) : 0;

    animateValue('kpi-faturamento',   0, fat, 1100, true);
    animateValue('kpi-feiraoneve',    0, feiraoNeve, 1100, true);
    animateValue('kpi-hotsales',      0, hotSales, 1100, true);
    animateValue('kpi-comissao',      0, parseFloat(c.comissao_green_anual) || 0, 1000, true);
    animateValue('kpi-transfer',      0, parseFloat(c.total_transfer)       || 0, 1000, true);
    animateValue('kpi-equipamentos',  0, parseFloat(c.total_equipamento)    || 0, 1000, true);
    animateValue('kpi-taxas',         0, parseFloat(c.total_taxa_inscricao) || 0, 1000, true);
    animateValue('kpi-cancelamentos', 0, parseFloat(c.cancelamentos)        || 0, 1000, true);

    // Gap de metas — usa receita anual acumulada
    const next = state.milestones.find(m => fat < m.value);
    const gap = next ? Math.max(next.value - fat, 0) : 0;
    animateValue('kpi-gap', 0, gap, 1000, true);
    const gapLabel = document.getElementById('kpi-gap-label');
    const gapSub = document.getElementById('kpi-gap-sub');
    if (next) {
        if (gapLabel) gapLabel.textContent = `Falta para ${next.label}`;
        if (gapSub)   gapSub.textContent   = `Objetivo: ${fmtCompact(next.value)}`;
    } else {
        if (gapLabel) gapLabel.textContent = 'Metas atingidas';
        if (gapSub)   gapSub.textContent   = 'Parabéns · todas as metas atingidas';
    }
}

// KPI recalc quando filtros aplicados — comissao afeta
function recalcFilteredKPIs(dataset) {
    const hasFilter = ['filtroCampanha','filtroOrigem','filtroMes','filtroVillage']
        .some(id => (document.getElementById(id)?.value || 'all') !== 'all');

    if (hasFilter) {
        // Recalcula comissão somando dataset filtrado
        const comis = dataset.reduce((s, r) => s + (parseFloat(r.comissao_green) || 0), 0);
        animateValue('kpi-comissao', 0, comis, 700, true);

        const trans = dataset.reduce((s, r) => {
            if (r.categoria && String(r.categoria).toLowerCase() === 'transfer') {
                return s + (parseFloat(r.valor_total) || 0);
            }
            return s;
        }, 0);
        animateValue('kpi-transfer', 0, trans, 700, true);
    } else {
        drawFixedKPIs();
    }
}

function animateValue(id, start, end, duration, isCurrency) {
    const el = document.getElementById(id);
    if (!el) return;
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
// CHARTS
// ============================================================
function renderCharts(dataset) {
    // Village: usa vw_village_resumo quando disponível (qtd_vendas confiável)
    const aggVillage = {}, aggVillageCount = {};
    const villageSource = (state.villageResumo && state.villageResumo.length > 0)
        ? state.villageResumo : dataset;

    villageSource.forEach(r => {
        const v = r.village || 'N/I';
        aggVillage[v]      = (aggVillage[v] || 0) + (parseFloat(r.valor_total) || 0);
        aggVillageCount[v] = (aggVillageCount[v] || 0) + (parseInt(r.qtd_vendas) || 0);
    });

    // Se filtros ativos, recalcula village pelo dataset filtrado
    const hasFilter = ['filtroCampanha','filtroOrigem','filtroMes','filtroVillage']
        .some(id => (document.getElementById(id)?.value || 'all') !== 'all');
    if (hasFilter) {
        Object.keys(aggVillage).forEach(k => { aggVillage[k] = 0; aggVillageCount[k] = 0; });
        dataset.forEach(r => {
            const v = r.village || 'N/I';
            aggVillage[v]      = (aggVillage[v] || 0) + (parseFloat(r.valor_total) || 0);
            aggVillageCount[v] = (aggVillageCount[v] || 0) + 1;
        });
    }

    const sortedV = Object.entries(aggVillage).sort((a, b) => b[1] - a[1]);
    const vLabels = sortedV.map(([k]) => k);
    const vValues = sortedV.map(([, v]) => v);
    const vCounts = vLabels.map(v => aggVillageCount[v] || 0);

    const villageEl = document.querySelector('.chart-container-village');
    if (villageEl) {
        const isMobile = window.innerWidth <= 640;
        const rowH = isMobile ? 44 : 52;
        const minH = isMobile ? 260 : 320;
        villageEl.style.height = Math.max(minH, vLabels.length * rowH + 80) + 'px';
    }

    buildChart('chartVillages', 'bar', vLabels, [
        {
            label: 'Valor Total (R$)',
            data: vValues,
            backgroundColor: palette.glacial,
            borderRadius: 999,
            borderSkipped: false,
            barThickness: 18,
            yAxisID: 'y',
            xAxisID: 'xValor'
        },
        {
            label: 'Qtd. Vendas',
            data: vCounts,
            backgroundColor: palette.gold,
            borderRadius: 999,
            borderSkipped: false,
            barThickness: 18,
            yAxisID: 'y',
            xAxisID: 'xQtd'
        }
    ], {
        indexAxis: 'y',
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: (ctx) => ctx.datasetIndex === 0
                        ? ' Valor Total: ' + fmtBRL(ctx.parsed.x)
                        : ' Qtd. Vendas: ' + ctx.parsed.x
                }
            }
        },
        scales: {
            y: { grid: { display: false }, ticks: { color: palette.text, font: { weight: '500' } } },
            xValor: {
                type: 'linear', position: 'bottom',
                title: { display: true, text: 'Valor Total (R$)', color: palette.primary, font: { weight: '600' } },
                ticks: { color: palette.primary, callback: v => fmtCompact(v) },
                grid: { color: palette.grid }
            },
            xQtd: {
                type: 'linear', position: 'top',
                title: { display: true, text: 'Qtd. Vendas', color: palette.tertiary, font: { weight: '600' } },
                ticks: { color: palette.tertiary, stepSize: 1, callback: v => Number.isInteger(v) ? v : '' },
                grid: { display: false }
            }
        }
    });

    // Agregações por campanha/origem (dataset filtrado)
    const aggCampanha = {}, aggOrigem = {}, cntOrigem = {};
    dataset.forEach(r => {
        const fat = parseFloat(r.valor_total) || 0;
        const camp = r.campanha || 'Outros';
        const orig = r.origem || 'Direto';
        aggCampanha[camp] = (aggCampanha[camp] || 0) + fat;
        aggOrigem[orig]   = (aggOrigem[orig]   || 0) + fat;
        cntOrigem[orig]   = (cntOrigem[orig]   || 0) + 1;
    });
    state._aggOrigem = aggOrigem;
    state._cntOrigem = cntOrigem;

    // Distribuição de Canais (donut) — mostra TODAS as origens
    const oLabels = Object.keys(aggOrigem).sort((a, b) => aggOrigem[b] - aggOrigem[a]);
    const oValues = oLabels.map(l => aggOrigem[l]);
    buildChart('chartOrigem', 'doughnut', oLabels, [{
        data: oValues,
        backgroundColor: oLabels.map((_, i) => categoricalColors[i % categoricalColors.length]),
        borderWidth: 3,
        borderColor: '#ffffff',
        hoverOffset: 10
    }], {
        cutout: '62%',
        plugins: {
            legend: {
                position: 'right',
                labels: { usePointStyle: true, boxWidth: 8, padding: 10, font: { size: 12 } }
            },
            tooltip: {
                callbacks: {
                    label: (c) => {
                        const total = oValues.reduce((s, v) => s + v, 0) || 1;
                        const pct = ((c.raw / total) * 100).toFixed(1);
                        return ` ${fmtBRL(c.raw)} · ${pct}%`;
                    }
                }
            }
        }
    });

}

function buildChart(id, type, labels, datasets, options) {
    const el = document.getElementById(id);
    if (!el) return;
    if (state.chartInstances[id]) state.chartInstances[id].destroy();
    state.chartInstances[id] = new Chart(el.getContext('2d'), {
        type,
        data: { labels, datasets },
        options: Object.assign({
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800, easing: 'easeOutQuart' }
        }, options)
    });
}

// ============================================================
// TOP SELLERS — tabela vendas_reservas.vendedora
// ============================================================
function renderTopSellers(_unused) {
    const container = document.getElementById('topSellers');
    if (!container) return;

    // Usa dados diretos da tabela vendas_reservas (carregados no init)
    const source = state.sellersRaw || [];

    const agg = {};
    const cnt = {};
    source.forEach(r => {
        const s = r.vendedora;
        if (!s) return;
        const fat = parseFloat(r.valor_total) || 0;
        agg[s] = (agg[s] || 0) + fat;
        cnt[s] = (cnt[s] || 0) + 1;
    });

    const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length === 0) {
        container.innerHTML = '<p class="text-xs text-on-surface-variant">Sem vendedores no recorte atual.</p>';
        return;
    }

    container.innerHTML = top.map(([name, value], i) => {
        const initials = String(name).split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
        const safeName = String(name).replace(/'/g, "&#39;").replace(/"/g, '&quot;');
        return `
          <div class="seller-row" role="button" tabindex="0" onclick="openSellerModal('${safeName}')">
            <div class="seller-rank">${i + 1}</div>
            <div class="seller-avatar">${initials}</div>
            <div class="seller-info">
                <div class="seller-name">${name} ${medal}</div>
                <div class="seller-meta">${cnt[name]} venda${cnt[name] > 1 ? 's' : ''} · clique para detalhes</div>
            </div>
            <div class="seller-value">${fmtBRL(value)}</div>
          </div>`;
    }).join('');
}

// ============================================================
// MODAIS
// ============================================================
function openVillageModal() {
    const body = document.getElementById('villageModalBody');
    const source = (state.villageResumo && state.villageResumo.length > 0)
        ? state.villageResumo : state.filtrados;

    const rows = source.map(r => ({
        name:  r.village || 'N/I',
        value: parseFloat(r.valor_total) || 0,
        qtd:   parseInt(r.qtd_vendas) || 0,
        comissao: parseFloat(r.comissao_green) || 0
    })).sort((a, b) => b.value - a.value);

    const total = rows.reduce((s, r) => s + r.value, 0) || 1;

    body.innerHTML = `
        <table class="detail-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Village</th>
                    <th>Faturamento</th>
                    <th>Qtd. Vendas</th>
                    <th>Comissão</th>
                    <th>Share</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r, i) => {
                    const pct = ((r.value / total) * 100).toFixed(1);
                    return `
                    <tr>
                        <td class="rank-cell">${i + 1}</td>
                        <td><strong>${r.name}</strong></td>
                        <td>${fmtBRL(r.value)}</td>
                        <td>${r.qtd}</td>
                        <td>${fmtBRL(r.comissao)}</td>
                        <td>
                            <div class="share-cell">
                                <div class="share-bar"><div class="share-bar-fill" style="width:${pct}%"></div></div>
                                <span>${pct}%</span>
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    document.getElementById('villageModal').classList.add('open');
}

function openChannelsModal() {
    const body = document.getElementById('channelsModalBody');
    const agg = state._aggOrigem || {};
    const cnt = state._cntOrigem || {};
    const entries = Object.entries(agg).sort((a, b) => b[1] - a[1]);
    // Total correto vem de consolidado_anual, não da soma parcial das origens da view
    const totalCorreto = state.fatAnualGlobal || entries.reduce((s, [, v]) => s + v, 0) || 1;
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;

    body.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-gutter mb-unit-lg">
            <div class="stat-pill">
                <div class="stat-pill-label">Receita Anual Acumulada</div>
                <div class="stat-pill-value">${fmtBRL(totalCorreto)}</div>
            </div>
            <div class="stat-pill">
                <div class="stat-pill-label">Canais ativos</div>
                <div class="stat-pill-value">${entries.length}</div>
            </div>
            <div class="stat-pill">
                <div class="stat-pill-label">Volume de vendas</div>
                <div class="stat-pill-value">${Object.values(cnt).reduce((s, v) => s + v, 0)}</div>
            </div>
        </div>
        <table class="detail-table">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Canal / Origem</th>
                    <th>Faturamento</th>
                    <th>Qtd. Vendas</th>
                    <th>Ticket Médio</th>
                    <th>Share (ROI)</th>
                </tr>
            </thead>
            <tbody>
                ${entries.map(([name, value], i) => {
                    const qtd = cnt[name] || 0;
                    const ticket = qtd > 0 ? value / qtd : 0;
                    const pct = ((value / total) * 100).toFixed(1);
                    return `
                    <tr>
                        <td class="rank-cell">${i + 1}</td>
                        <td><strong>${name}</strong></td>
                        <td>${fmtBRL(value)}</td>
                        <td>${qtd}</td>
                        <td>${fmtBRL(ticket)}</td>
                        <td>
                            <div class="share-cell">
                                <div class="share-bar"><div class="share-bar-fill" style="width:${pct}%"></div></div>
                                <span>${pct}%</span>
                            </div>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>`;
    document.getElementById('channelsModal').classList.add('open');
}

// ============================================================
// AUTO-REFRESH / TIMESTAMP
// ============================================================
function updateTimestamp() {
    const now = new Date();
    const text = 'Atualizado ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const el  = document.getElementById('updateTime');
    const ets = document.getElementById('ts-updateTime');
    if (el) el.textContent = text;
    if (ets) ets.textContent = text;
}

async function silentRefresh() {
    try {
        const [r1, r2, r3, r4] = await Promise.all([
            sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
            sb.from('vw_dashboard_vendas').select('*'),
            sb.from('vw_village_resumo').select('*'),
            sb.from('vendas_reservas').select('vendedora, valor_total').not('vendedora', 'is', null)
        ]);
        if (r1.data) {
            state.consolidado = r1.data;
            state.fatAnualGlobal  = parseFloat(r1.data.total_faturamento_anual || 0);
            state.fatFeiraoGlobal = parseFloat(r1.data.total_feirao_2026 || 0);
            buildMilestones();
            updateGamification();
            drawFixedKPIs();
        }
        if (r2.data) {
            state.vendas = r2.data;
            populateDropdowns();
            applyFilters();
        }
        if (r3.data) state.villageResumo = r3.data;
        if (r4.data) { state.sellersRaw = r4.data; renderTopSellers(); }
        updateTimestamp();
    } catch (e) { console.warn('silentRefresh:', e); }
}

// ============================================================
// TABLET SLIDESHOW
// ============================================================
const slideshow = { active: false, paused: false, currentSlide: 0, timer: null, INTERVAL: 10000 };

function calcMetaPctRelative(fat, m, list) {
    const idx = list.indexOf(m);
    const prev = idx > 0 ? list[idx - 1].value : 0;
    const range = m.value - prev;
    if (range <= 0) return 100;
    return Math.max(0, Math.min(((fat - prev) / range) * 100, 100)).toFixed(1);
}

function buildSlidesData() {
    const c = state.consolidado;
    const fat = state.fatAnualGlobal; // usa receita anual para metas
    const fatAnual = state.fatAnualGlobal;
    const next = state.milestones.find(m => fat < m.value);
    const diff = next ? Math.max(next.value - fat, 0) : 0;
    const pct = next ? Math.min((fat / next.value) * 100, 100).toFixed(1) : 100;

    const aggV = {}, aggO = {};
    state.vendas.forEach(r => {
        const v = parseFloat(r.valor_total) || 0;
        aggV[r.village || 'N/I'] = (aggV[r.village || 'N/I'] || 0) + v;
        aggO[r.origem || 'Direto'] = (aggO[r.origem || 'Direto'] || 0) + v;
    });
    const vEntries = Object.entries(aggV).sort((a, b) => b[1] - a[1]);
    const oEntries = Object.entries(aggO).sort((a, b) => b[1] - a[1]);

    return [
        // Slide 1 — Dual hero
        {
            id: 'slide-hero',
            render: (el) => {
                const feirao = parseFloat(c.total_feirao_2026) || 0;
                el.innerHTML = `
                    <div class="ts-eyebrow">Destaques do Período</div>
                    <div class="ts-dual-hero">
                        <div class="ts-dual-block ts-dual-main">
                            <div class="ts-dual-label">Faturamento Feirão 2026</div>
                            <div class="ts-hero-value ts-hero-feirao">${fmtBRL(feirao)}</div>
                        </div>
                        <div class="ts-dual-divider"></div>
                        <div class="ts-dual-block ts-dual-secondary">
                            <div class="ts-dual-label">Faturamento Total Anual</div>
                            <div class="ts-hero-value ts-hero-secondary">${fmtBRL(fatAnual)}</div>
                        </div>
                    </div>
                    <div class="ts-meta-chip ${next ? '' : 'achieved'}">
                        ${next
                            ? `Faltam <strong>${fmtBRL(diff)}</strong> para <strong>${next.label}</strong>`
                            : '★ Todas as metas atingidas'}
                    </div>
                    <div class="ts-progress-wrap">
                        <div class="ts-progress-track">
                            <div class="ts-progress-fill" style="width:0%" data-pct="${pct}"></div>
                        </div>
                        <div class="ts-progress-label">${pct}% ${next ? `até ${next.label}` : ''}</div>
                    </div>`;
                setTimeout(() => {
                    const bar = el.querySelector('.ts-progress-fill');
                    if (bar) bar.style.width = pct + '%';
                }, 80);
            }
        },
        // Slide 2 — KPIs
        {
            id: 'slide-kpis',
            render: (el) => {
                const items = [
                    { label: 'Feirão 2026',     value: parseFloat(c.total_feirao_2026) || 0,     color: palette.tertiaryCt },
                    { label: 'Comissão Green',  value: parseFloat(c.comissao_green_anual) || 0,  color: palette.tertiary },
                    { label: 'Transfer',        value: parseFloat(c.total_transfer) || 0,        color: palette.primaryCt },
                    { label: 'Equipamento',     value: parseFloat(c.total_equipamento) || 0,     color: palette.primary },
                    { label: 'Taxa Inscrição',  value: parseFloat(c.total_taxa_inscricao) || 0,  color: palette.primaryCt },
                    { label: 'Cancelamentos',   value: parseFloat(c.cancelamentos) || 0,         color: '#ff7a7a' }
                ];
                el.innerHTML = `
                    <div class="ts-eyebrow">Breakdown de Receita</div>
                    <div class="ts-kpi-grid">
                        ${items.map(it => `
                            <div class="ts-kpi-item">
                                <div class="ts-kpi-bar" style="background:${it.color}"></div>
                                <div class="ts-kpi-label">${it.label}</div>
                                <div class="ts-kpi-val">${fmtBRL(it.value)}</div>
                            </div>`).join('')}
                    </div>`;
            }
        },
        // Slide 3 — Villages
        {
            id: 'slide-villages',
            render: (el) => {
                const total = vEntries.reduce((s, [, v]) => s + v, 0) || 1;
                el.innerHTML = `
                    <div class="ts-eyebrow">Vendas por Village</div>
                    <div class="ts-ranking">
                        ${vEntries.map(([name, val], i) => {
                            const p = ((val / total) * 100).toFixed(1);
                            return `
                            <div class="ts-rank-row">
                                <div class="ts-rank-num">${i + 1}</div>
                                <div class="ts-rank-info">
                                    <div class="ts-rank-name">${name}</div>
                                    <div class="ts-rank-bar-wrap">
                                        <div class="ts-rank-bar" style="width:0%" data-w="${p}"></div>
                                    </div>
                                </div>
                                <div class="ts-rank-val">${fmtBRL(val)}</div>
                            </div>`;
                        }).join('')}
                    </div>`;
                setTimeout(() => {
                    el.querySelectorAll('.ts-rank-bar').forEach(b => b.style.width = b.dataset.w + '%');
                }, 80);
            }
        },
        // Slide 4 — Distribuição canais
        {
            id: 'slide-origem',
            render: (el) => {
                const total = oEntries.reduce((s, [, v]) => s + v, 0) || 1;
                el.innerHTML = `
                    <div class="ts-eyebrow">Distribuição de Canais</div>
                    <div class="ts-ranking">
                        ${oEntries.map(([name, val], i) => {
                            const p = ((val / total) * 100).toFixed(1);
                            return `
                            <div class="ts-rank-row">
                                <div class="ts-rank-num">${i + 1}</div>
                                <div class="ts-rank-info">
                                    <div class="ts-rank-name">${name}</div>
                                    <div class="ts-rank-bar-wrap">
                                        <div class="ts-rank-bar ts-rank-bar--gold" style="width:0%" data-w="${p}"></div>
                                    </div>
                                </div>
                                <div class="ts-rank-val">${fmtBRL(val)}</div>
                            </div>`;
                        }).join('')}
                    </div>`;
                setTimeout(() => {
                    el.querySelectorAll('.ts-rank-bar').forEach(b => b.style.width = b.dataset.w + '%');
                }, 80);
            }
        },
        // Slide 5 — Mapa de Metas
        {
            id: 'slide-metas',
            render: (el) => {
                el.innerHTML = `
                    <div class="ts-eyebrow">Mapa de Metas</div>
                    <div class="ts-metas-list">
                        ${state.milestones.map(m => {
                            const achieved = fat >= m.value;
                            const isCurrent = !achieved && m === next;
                            const p = calcMetaPctRelative(fat, m, state.milestones);
                            return `
                            <div class="ts-meta-row ${achieved ? 'ts-meta-done' : ''} ${isCurrent ? 'ts-meta-current' : ''}">
                                <div class="ts-meta-icon">${achieved ? '✓' : isCurrent ? '◉' : '○'}</div>
                                <div class="ts-meta-info">
                                    <div class="ts-meta-name">${m.label}</div>
                                    <div class="ts-meta-target">${fmtBRL(m.value)}</div>
                                </div>
                                <div class="ts-meta-pct">${achieved ? '100%' : p + '%'}</div>
                            </div>`;
                        }).join('')}
                    </div>`;
            }
        }
    ];
}

function showSlide(index) {
    const slides = buildSlidesData();
    const n = slides.length;
    slideshow.currentSlide = ((index % n) + n) % n;
    const slide = slides[slideshow.currentSlide];

    const content = document.getElementById('ts-content');
    content.style.opacity = '0';
    content.style.transform = 'translateY(10px)';
    setTimeout(() => {
        slide.render(content);
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    }, 200);

    document.querySelectorAll('.ts-dot').forEach((d, i) => d.classList.toggle('active', i === slideshow.currentSlide));

    const prog = document.getElementById('ts-timer-bar');
    if (prog) {
        prog.style.transition = 'none';
        prog.style.width = '0%';
        if (!slideshow.paused) {
            setTimeout(() => {
                prog.style.transition = `width ${slideshow.INTERVAL}ms linear`;
                prog.style.width = '100%';
            }, 50);
        }
    }
}

function startAutoAdvance() {
    clearInterval(slideshow.timer);
    slideshow.timer = setInterval(() => showSlide(slideshow.currentSlide + 1), slideshow.INTERVAL);
}

function startSlideshow() {
    if (slideshow.active) return;
    slideshow.active = true;
    slideshow.paused = false;
    document.getElementById('tablet-slideshow').classList.add('ts-visible');
    document.body.style.overflow = 'hidden';

    const panel = document.querySelector('.ts-panel');
    if (panel.requestFullscreen) panel.requestFullscreen().catch(() => {});

    const slides = buildSlidesData();
    document.getElementById('ts-dots').innerHTML = slides.map((_, i) =>
        `<div class="ts-dot${i === 0 ? ' active' : ''}" onclick="showSlide(${i})"></div>`).join('');
    updatePauseButton();
    showSlide(0);
    startAutoAdvance();
}

function stopSlideshow() {
    slideshow.active = false;
    slideshow.paused = false;
    clearInterval(slideshow.timer);
    slideshow.timer = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    document.getElementById('tablet-slideshow').classList.remove('ts-visible');
    document.body.style.overflow = '';
}

// ============================================================
// SELLER MODAL — Detalhes do Vendedor (com filtros)
// ============================================================
state.sellerCache = {};
state.smCharts = {};

function getInitials(n) {
    return String(n).split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}

async function openSellerModal(nome) {
    state.currentSeller = nome;

    document.getElementById('smName').textContent = nome;
    document.getElementById('smAvatar').textContent = getInitials(nome);
    document.getElementById('smMeta').textContent = 'Carregando…';
    document.getElementById('sellerModal').classList.add('open');

    let sales = state.sellerCache[nome];
    if (!sales) {
        const { data, error } = await sb
            .from('vendas_reservas')
            .select('*')
            .eq('vendedora', nome);
        if (error) { console.warn('Seller query:', error); sales = []; }
        else { sales = data || []; }
        state.sellerCache[nome] = sales;
    }

    document.getElementById('smMeta').textContent = `${sales.length} venda${sales.length !== 1 ? 's' : ''}`;
    renderSellerKPIs(sales);
    renderSellerCharts(sales);
    renderSellerTimeline(sales);
}

function renderSellerKPIs(sales) {
    const total  = sales.reduce((a, s) => a + (parseFloat(s.valor_total) || 0), 0);
    const qtd    = sales.length;
    const ticket = qtd ? total / qtd : 0;
    const best   = sales.reduce((m, s) => {
        const v = parseFloat(s.valor_total) || 0;
        return v > m ? v : m;
    }, 0);

    document.getElementById('smKpis').innerHTML = `
        <div class="sm-kpi-tile">
            <div class="sm-kpi-icon a"><span class="material-symbols-outlined">payments</span></div>
            <div class="sm-kpi-info"><span class="sm-kpi-label">Faturamento</span><span class="sm-kpi-value">${fmtBRL(total)}</span></div>
        </div>
        <div class="sm-kpi-tile">
            <div class="sm-kpi-icon b"><span class="material-symbols-outlined">receipt_long</span></div>
            <div class="sm-kpi-info"><span class="sm-kpi-label">Qtd. Vendas</span><span class="sm-kpi-value">${qtd}</span></div>
        </div>
        <div class="sm-kpi-tile">
            <div class="sm-kpi-icon c"><span class="material-symbols-outlined">confirmation_number</span></div>
            <div class="sm-kpi-info"><span class="sm-kpi-label">Ticket Médio</span><span class="sm-kpi-value">${fmtBRL(ticket)}</span></div>
        </div>
        <div class="sm-kpi-tile">
            <div class="sm-kpi-icon d"><span class="material-symbols-outlined">emoji_events</span></div>
            <div class="sm-kpi-info"><span class="sm-kpi-label">Maior Venda</span><span class="sm-kpi-value">${fmtBRL(best)}</span></div>
        </div>
    `;
}

function renderSellerCharts(sales) {
    const byTipo = {}, byCamp = {};
    sales.forEach(s => {
        const tKey = (s.categoria && String(s.categoria).trim()) || 'Outros';
        const cKey = (s.campanha  && String(s.campanha).trim())  || 'Sem campanha';
        const v = parseFloat(s.valor_total) || 0;
        byTipo[tKey] = (byTipo[tKey] || 0) + v;
        byCamp[cKey] = (byCamp[cKey] || 0) + v;
    });

    // Chart Tipo (donut)
    if (state.smCharts.tipo) state.smCharts.tipo.destroy();
    const tipoEntries = Object.entries(byTipo).sort((a, b) => b[1] - a[1]);
    state.smCharts.tipo = new Chart(document.getElementById('smChartTipo').getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: tipoEntries.map(e => e[0]),
            datasets: [{
                data: tipoEntries.map(e => e[1]),
                backgroundColor: categoricalColors,
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 10, padding: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtBRL(ctx.parsed)}` } }
            }
        }
    });

    // Chart Campanha (bar horizontal)
    if (state.smCharts.camp) state.smCharts.camp.destroy();
    const campEntries = Object.entries(byCamp).sort((a, b) => b[1] - a[1]);
    state.smCharts.camp = new Chart(document.getElementById('smChartCampanha').getContext('2d'), {
        type: 'bar',
        data: {
            labels: campEntries.map(e => e[0]),
            datasets: [{
                data: campEntries.map(e => e[1]),
                backgroundColor: palette.primary,
                borderRadius: 6,
                maxBarThickness: 26
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: ctx => fmtBRL(ctx.parsed.x) } }
            },
            scales: {
                x: { grid: { color: palette.grid }, ticks: { callback: v => 'R$ ' + (v/1000).toFixed(0) + 'k' } },
                y: { grid: { display: false } }
            }
        }
    });
}

function renderSellerTimeline(sales) {
    const keys = sales[0] ? Object.keys(sales[0]) : [];
    const kDate = keys.find(k => ['data_venda','created_at','data','dt_'].some(p => k.toLowerCase().includes(p)));

    const sorted = [...sales].sort((a, b) => {
        const da = kDate ? new Date(a[kDate] || 0) : 0;
        const db = kDate ? new Date(b[kDate] || 0) : 0;
        return db - da;
    }).slice(0, 15);

    const tbody = document.querySelector('#smTimeline tbody');
    if (sorted.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--on-surface-variant);padding:1rem;">Nenhuma venda com os filtros atuais</td></tr>`;
        return;
    }
    tbody.innerHTML = sorted.map(s => {
        let dStr = '—';
        if (kDate && s[kDate]) {
            const d = new Date(s[kDate]);
            dStr = isNaN(d) ? String(s[kDate]) : d.toLocaleDateString('pt-BR');
        }
        return `<tr>
            <td>${dStr}</td>
            <td>${s.categoria || '—'}</td>
            <td>${s.village || '—'}</td>
            <td>${s.campanha || '—'}</td>
            <td style="text-align:right;font-weight:600;color:var(--tertiary);">${fmtBRL(s.valor_total)}</td>
        </tr>`;
    }).join('');
}

// ============================================================
// POPUP ÚLTIMA VENDA
// ============================================================
async function initUltimaVenda() {
    let sale = null;

    // Tenta buscar a venda mais recente da tabela vendas_reservas
    const dateColumns = ['created_at', 'data_venda', 'data', 'dt_venda'];
    for (const col of dateColumns) {
        const { data, error } = await sb
            .from('vendas_reservas')
            .select('*')
            .order(col, { ascending: false })
            .limit(1);
        if (!error && data && data.length > 0) { sale = data[0]; break; }
    }

    // Fallback: usa última entrada de state.vendas
    if (!sale && state.vendas.length > 0) {
        const kDate = Object.keys(state.vendas[0]).find(k =>
            ['data_venda','data','mes_ano','created_at','dt_'].some(p => k.toLowerCase().includes(p))
        );
        const sorted = kDate
            ? [...state.vendas].sort((a, b) => new Date(b[kDate]) - new Date(a[kDate]))
            : state.vendas;
        sale = sorted[0];
    }

    if (!sale) return;
    renderUltimaVenda(sale);
    initUvpDrag();
}

function renderUltimaVenda(sale) {
    const keys = Object.keys(sale);
    const find = (...terms) => keys.find(k => terms.some(t => k.toLowerCase().includes(t)));

    const kDate    = find('data_venda', 'data', 'created_at', 'mes_ano', 'dt_');
    const kVal     = find('valor_total', 'faturamento', 'valor', 'total');
    const kCat     = find('campanha', 'category');
    const kTipo    = find('categoria', 'tipo_venda', 'tipo', 'produto');
    const kVillage = find('village', 'destino', 'resort');
    const kSell    = find('vendedora', 'vendedor', 'consultor', 'seller', 'nome_vend');

    let dataStr = '—';
    if (kDate && sale[kDate]) {
        const d = new Date(sale[kDate]);
        dataStr = isNaN(d) ? String(sale[kDate]) : d.toLocaleDateString('pt-BR');
    }
    const valorStr = kVal  && sale[kVal]  != null ? fmtBRL(sale[kVal])  : '—';
    const catStr   = kCat  && sale[kCat]  != null ? String(sale[kCat])  : '—';
    const sellStr  = kSell && sale[kSell] != null ? String(sale[kSell]) : '—';

    // Identifica tipo da venda (Village / Equipamento / Transfer / Taxa / Outros)
    const tipoRaw = kTipo && sale[kTipo] != null ? String(sale[kTipo]).trim() : '';
    const villageName = kVillage && sale[kVillage] != null ? String(sale[kVillage]).trim() : '';
    const tipoLow = tipoRaw.toLowerCase();

    let tipoIcon = 'sell';
    let tipoLabel = 'Tipo da Venda';
    let tipoValue = tipoRaw || '—';

    if (tipoLow.includes('village') || (villageName && villageName !== 'N/I' && villageName !== '')) {
        tipoIcon  = 'apartment';
        tipoLabel = 'Village';
        tipoValue = villageName && villageName !== 'N/I' ? villageName : (tipoRaw || 'Village');
    } else if (tipoLow.includes('equip')) {
        tipoIcon  = 'snowboarding';
        tipoLabel = 'Equipamento';
        tipoValue = tipoRaw;
    } else if (tipoLow.includes('transfer')) {
        tipoIcon  = 'airport_shuttle';
        tipoLabel = 'Transfer';
        tipoValue = tipoRaw;
    } else if (tipoLow.includes('taxa')) {
        tipoIcon  = 'receipt_long';
        tipoLabel = 'Taxa';
        tipoValue = tipoRaw;
    }

    document.getElementById('uvpBody').innerHTML = `
        <div class="uvp-pill">
            <div class="uvp-pill-icon date">
                <span class="material-symbols-outlined">calendar_month</span>
            </div>
            <div class="uvp-pill-info">
                <span class="uvp-pill-label">Data</span>
                <span class="uvp-pill-value">${dataStr}</span>
            </div>
        </div>
        <div class="uvp-pill">
            <div class="uvp-pill-icon value">
                <span class="material-symbols-outlined">payments</span>
            </div>
            <div class="uvp-pill-info">
                <span class="uvp-pill-label">Valor</span>
                <span class="uvp-pill-value destaque">${valorStr}</span>
            </div>
        </div>
        <div class="uvp-pill">
            <div class="uvp-pill-icon tipo">
                <span class="material-symbols-outlined">${tipoIcon}</span>
            </div>
            <div class="uvp-pill-info">
                <span class="uvp-pill-label">${tipoLabel}</span>
                <span class="uvp-pill-value">${tipoValue}</span>
            </div>
        </div>
        <div class="uvp-pill">
            <div class="uvp-pill-icon cat">
                <span class="material-symbols-outlined">campaign</span>
            </div>
            <div class="uvp-pill-info">
                <span class="uvp-pill-label">Campanha</span>
                <span class="uvp-pill-value">${catStr}</span>
            </div>
        </div>
        <div class="uvp-pill">
            <div class="uvp-pill-icon seller">
                <span class="material-symbols-outlined">person</span>
            </div>
            <div class="uvp-pill-info">
                <span class="uvp-pill-label">Vendedora</span>
                <span class="uvp-pill-value">${sellStr}</span>
            </div>
        </div>
    `;

    const popup = document.getElementById('ultimaVendaPopup');
    popup.style.animation = '';
    popup.style.display = 'block';
    void popup.offsetWidth; // força reflow para reiniciar animação
    popup.style.animation = 'uvpEntrar .45s cubic-bezier(.34,1.56,.64,1) both';
}

function toggleUvpMinimize() {
    const popup = document.getElementById('ultimaVendaPopup');
    const icon  = document.getElementById('uvpMinimizeIcon');
    const minimized = popup.classList.toggle('uvp-minimized');
    icon.textContent = minimized ? 'expand_more' : 'expand_less';
}

function fecharUltimaVenda() {
    const popup = document.getElementById('ultimaVendaPopup');
    popup.style.animation = 'uvpSair .25s ease forwards';
    setTimeout(() => { popup.style.display = 'none'; }, 270);
}

function initUvpDrag() {
    const popup  = document.getElementById('ultimaVendaPopup');
    const handle = document.getElementById('uvpHandle');
    let dragging = false, ox = 0, oy = 0;

    const startDrag = (cx, cy) => {
        const r = popup.getBoundingClientRect();
        ox = cx - r.left;
        oy = cy - r.top;
        dragging = true;
        popup.style.right  = 'auto';
        popup.style.bottom = 'auto';
        popup.style.left   = r.left + 'px';
        popup.style.top    = r.top  + 'px';
        popup.style.animation = 'none';
    };
    const moveDrag = (cx, cy) => {
        if (!dragging) return;
        popup.style.left = (cx - ox) + 'px';
        popup.style.top  = (cy - oy) + 'px';
    };
    const endDrag = () => { dragging = false; };

    handle.addEventListener('mousedown', e => {
        if (e.target.closest('.uvp-close')) return;
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
    });
    document.addEventListener('mousemove', e => moveDrag(e.clientX, e.clientY));
    document.addEventListener('mouseup', endDrag);

    handle.addEventListener('touchstart', e => {
        if (e.target.closest('.uvp-close')) return;
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    document.addEventListener('touchend', endDrag);
}

function togglePause() {
    slideshow.paused = !slideshow.paused;
    const prog = document.getElementById('ts-timer-bar');
    if (slideshow.paused) {
        clearInterval(slideshow.timer);
        slideshow.timer = null;
        if (prog) {
            const w = getComputedStyle(prog).width;
            prog.style.transition = 'none';
            prog.style.width = w;
        }
    } else {
        if (prog) setTimeout(() => {
            prog.style.transition = `width ${slideshow.INTERVAL}ms linear`;
            prog.style.width = '100%';
        }, 50);
        startAutoAdvance();
    }
    updatePauseButton();
}

function updatePauseButton() {
    const btn = document.getElementById('ts-pause-btn');
    if (!btn) return;
    const icon = btn.querySelector('.material-symbols-outlined');
    if (!icon) return;
    icon.textContent = slideshow.paused ? 'play_arrow' : 'pause';
    btn.title = slideshow.paused ? 'Retomar (Espaço)' : 'Pausar (Espaço)';
}

document.addEventListener('keydown', (e) => {
    if (!slideshow.active) return;
    if (e.key === 'Escape') stopSlideshow();
    if (e.key === ' ')     { e.preventDefault(); togglePause(); }
    if (e.key === 'ArrowRight') { clearInterval(slideshow.timer); showSlide(slideshow.currentSlide + 1); if (!slideshow.paused) startAutoAdvance(); }
    if (e.key === 'ArrowLeft')  { clearInterval(slideshow.timer); showSlide(slideshow.currentSlide - 1); if (!slideshow.paused) startAutoAdvance(); }
});
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && slideshow.active) stopSlideshow();
});
(function() {
    let sx = 0, sy = 0;
    document.addEventListener('touchstart', (e) => {
        if (!slideshow.active) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', (e) => {
        if (!slideshow.active) return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
            clearInterval(slideshow.timer);
            showSlide(slideshow.currentSlide + (dx < 0 ? 1 : -1));
            if (!slideshow.paused) startAutoAdvance();
        }
    }, { passive: true });
})();
