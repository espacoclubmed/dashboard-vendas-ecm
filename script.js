// ============================================================
// SUPABASE — Inicialização
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
    villageResumo: [],
    vendasReservas: [],
    chartInstances: {},
    fatAnualGlobal: 0,
    fatFeiraoGlobal: 0,
    milestones: [],
    villageViewMode: 'both' // 'valor', 'qtd', 'both'
};

const chartColors = {
    text:     '#A3A091',               /* taupe */
    grid:     'rgba(0,0,0,0.04)',      /* separador suave */
    navy:     '#45524A',               /* verde-escuro */
    glacial:  '#97B4C2',               /* azul-aco */
    gold:     '#CEAC2D',               /* dourado */
    brown:    '#8E623E',               /* marrom */
    deep:     '#5e8590',               /* azul-profundo */
    sky:      '#7ac9ee',               /* azul-ceu */
};

Chart.defaults.color = chartColors.text;
Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(255,255,255,0.97)';
Chart.defaults.plugins.tooltip.titleColor = chartColors.navy;
Chart.defaults.plugins.tooltip.bodyColor = chartColors.text;
Chart.defaults.plugins.tooltip.padding = 12;
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.borderColor = 'rgba(0,0,0,0.06)';
Chart.defaults.plugins.tooltip.cornerRadius = 12;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [resConsolidado, resVendas, resVillage, resReservas] = await Promise.all([
            sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
            sb.from('vw_dashboard_vendas').select('*'),
            sb.from('vw_village_resumo').select('village,valor_total,qtd_vendas,comissao_green'),
            sb.from('vendas_reservas').select('vendedora,valor_total,village,data_in,data_out')
        ]);

        if (resConsolidado.error) console.warn("Erro Consolidado:", resConsolidado.error);
        if (resVendas.error) throw resVendas.error;
        if (resVillage.error) console.warn("Erro vw_village_resumo:", resVillage.error);
        if (resReservas.error) console.warn("Erro vendas_reservas:", resReservas.error);

        state.consolidado = resConsolidado.data || {};
        state.vendas = resVendas.data || [];
        state.villageResumo = resVillage.data || [];
        state.vendasReservas = resReservas.data || [];
        state.fatAnualGlobal = parseFloat(state.consolidado.total_faturamento_anual || 0);
        state.fatFeiraoGlobal = parseFloat(state.consolidado.total_feirao_2026 || 0);

        buildMilestones();
        updateGamification();
        await populateDropdowns();

        drawFixedKPIs();
        await applyFilters();
        renderVendedoresChart();
        renderDatasViagemChart();
        await renderOrigemCard();

    } catch (error) {
        console.error("Critical Error:", error);
    } finally {
        setTimeout(() => {
            const l = document.getElementById('globalLoader');
            if (l) {
                l.style.opacity = '0';
                setTimeout(() => l.style.display = 'none', 600);
            }
        }, 800);
    }

    // ============================================================
    // REALTIME — consolidado_anual (tabela física)
    // ============================================================
    sb.channel('consolidado_changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'consolidado_anual' },
            async () => {
                console.log('Realtime: consolidado_anual atualizado, rebuscando dados...');

                const [resConsolidado, resVendas, resVillage, resReservas] = await Promise.all([
                    sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
                    sb.from('vw_dashboard_vendas').select('*'),
                    sb.from('vw_village_resumo').select('village,valor_total,qtd_vendas,comissao_green'),
                    sb.from('vendas_reservas').select('vendedora,valor_total,village,data_in,data_out')
                ]);

                if (resConsolidado.data) {
                    state.consolidado = resConsolidado.data;
                    state.fatAnualGlobal = parseFloat(resConsolidado.data.total_faturamento_anual || 0);
                    state.fatFeiraoGlobal = parseFloat(resConsolidado.data.total_feirao_2026 || 0);
                }

                if (resVendas.data) {
                    state.vendas = resVendas.data;
                }

                if (resVillage.data) {
                    state.villageResumo = resVillage.data;
                }

                if (resReservas.data) {
                    state.vendasReservas = resReservas.data;
                }

                buildMilestones();
                updateGamification();
                await populateDropdowns();
                drawFixedKPIs();
                await applyFilters();
                renderVendedoresChart();
                renderDatasViagemChart();
                await renderOrigemCard();
            }
        )
        .subscribe();

    // ============================================================
    // AUTO-REFRESH — views a cada 5 minutos (fallback de segurança)
    // ============================================================
    setInterval(async () => {
        console.log('Auto-refresh: rebuscando views...');

        const [resConsolidado, resVendas, resVillage] = await Promise.all([
            sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
            sb.from('vw_dashboard_vendas').select('*'),
            sb.from('vw_village_resumo').select('village,valor_total,qtd_vendas,comissao_green')
        ]);

        if (resConsolidado.data) {
            state.consolidado = resConsolidado.data;
            state.fatAnualGlobal = parseFloat(resConsolidado.data.total_faturamento_anual || 0);
            state.fatFeiraoGlobal = parseFloat(resConsolidado.data.total_feirao_2026 || 0);
        }

        if (resVendas.data) {
            state.vendas = resVendas.data;
        }

        if (resVillage.data) {
            state.villageResumo = resVillage.data;
        }

        buildMilestones();
        updateGamification();
        await populateDropdowns();
        drawFixedKPIs();
        await applyFilters();
    }, 5 * 60 * 1000);
});

// ============================================================
// UTILS
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

function buildMilestones() {
    state.milestones = [
        { label: 'Meta 1', value: 3300000 },
        { label: 'Meta 2', value: 4300000 },
        { label: 'Feirão 2025', value: 4375099.76, special: true },
        { label: 'Meta 3', value: 5000000 },
        { label: 'Meta 4', value: 6000000 }
    ].sort((a,b) => a.value - b.value);
}

// ============================================================
// PROGRESS BAR — GLOBAL (Usa faturamento do Feirão para metas)
// ============================================================
function updateGamification() {
    const fat = state.fatFeiraoGlobal; // Metas baseadas no Feirão
    const container = document.getElementById('milestonesContainer');
    const fill = document.getElementById('progressFill');
    const remainText = document.getElementById('gamiRemainingText');
    if (!container || !fill) return;

    container.innerHTML = '';
    const maxVal = Math.max(...state.milestones.map(m => m.value)) * 1.1;
    const pct = Math.min((fat / maxVal) * 100, 100);

    setTimeout(() => {
        fill.style.width = pct + '%';
        fill.setAttribute('data-current', `Feirão 2026: ${fmtBRL(fat)}`);
    }, 400);

    // Sempre aponta para a próxima meta não atingida
    const next = state.milestones.find(m => fat < m.value);
    if (next) {
        const diff = next.value - fat;
        remainText.innerHTML = `Faltam <strong>${fmtBRL(diff)}</strong> para a <strong>${next.label}</strong>`;
    } else {
        remainText.innerHTML = '🏆 <strong>Todas as metas atingidas!</strong>';
    }

    state.milestones.forEach(m => {
        const pos = (m.value / maxVal) * 100;
        const mk = document.createElement('div');
        const isFeirao = m.label.toLowerCase().includes('feirão');
        const placement = isFeirao ? 'marker-below' : 'marker-above';
        const isAchieved = fat >= m.value;

        const isNext = (next && next.label === m.label);
        const badgeState = isAchieved ? 'achieved' : isNext ? 'current' : 'future';
        const badgeIcon  = isAchieved ? '✓' : isNext ? '◎' : '○';
        const dotClass   = `ms-dot ms-dot--${badgeState}`;
        const valCompact = fmtCompact(m.value);

        mk.className = `milestone-marker ${placement} ${m.special ? 'is-feirao' : ''} ${isAchieved ? 'is-achieved' : ''}`;
        mk.style.left = pos + '%';
        mk.style.pointerEvents = 'auto';
        mk.setAttribute('data-label', `${m.label} · ${fmtBRL(m.value)}${isAchieved ? ' ✓' : ''}`);

        mk.innerHTML = `
            <div class="ms-badge ms-badge--${badgeState}">
                <span class="ms-badge__icon">${badgeIcon}</span>
                <span class="ms-badge__label">${m.label}</span>
                <span class="ms-badge__value">${valCompact}</span>
            </div>
            <div class="${dotClass}"></div>`;
        container.appendChild(mk);
    });
}

// ============================================================
// FILTERS
// ============================================================
async function populateDropdowns() {
    const { data, error } = await sb.from('vw_filtros_dashboard').select('*');
    if (error) { console.warn('Erro ao carregar filtros:', error); return; }

    const campanhas = new Set();
    const origens = new Set();
    const meses = new Set();
    const villages = new Set();

    data.forEach(r => {
        if (r.campanha) campanhas.add(String(r.campanha));
        if (r.origem)   origens.add(String(r.origem));
        if (r.mes_ano)  meses.add(String(r.mes_ano));
    });

    state.vendas.forEach(r => {
        if (r.village) villages.add(String(r.village));
    });

    const sC = document.getElementById('filtroCampanha');
    const sO = document.getElementById('filtroOrigem');
    const sM = document.getElementById('filtroMes');
    const sV = document.getElementById('filtroVillage');
    const sDV = document.getElementById('filtroDatasVillage');

    const prevVillage = sV ? sV.value : 'all';
    const prevDatasVillage = sDV ? sDV.value : 'all';

    if (sC) sC.innerHTML = '<option value="all">Todas as campanhas</option>';
    if (sO) sO.innerHTML = '<option value="all">Todas as origens</option>';
    if (sM) sM.innerHTML = '<option value="all">Todos os meses</option>';
    if (sV) sV.innerHTML = '<option value="all">Todos os villages</option>';
    if (sDV) sDV.innerHTML = '<option value="all">Todos os villages</option>';

    if (sC) Array.from(campanhas).sort().forEach(c => sC.appendChild(new Option(c, c)));
    if (sO) Array.from(origens).sort().forEach(o => sO.appendChild(new Option(o, o)));
    if (sM) Array.from(meses).forEach(m => sM.appendChild(new Option(m, m)));
    if (sV) {
        Array.from(villages).sort().forEach(v => sV.appendChild(new Option(v, v)));
        if (prevVillage !== 'all' && villages.has(prevVillage)) sV.value = prevVillage;
    }
    if (sDV) {
        Array.from(villages).sort().forEach(v => sDV.appendChild(new Option(v, v)));
        if (prevDatasVillage !== 'all' && villages.has(prevDatasVillage)) sDV.value = prevDatasVillage;
    }
}

async function applyFilters() {
    const vC = document.getElementById('filtroCampanha').value;
    const vO = document.getElementById('filtroOrigem').value;
    const vM = document.getElementById('filtroMes').value;
    const vV = document.getElementById('filtroVillage')?.value || 'all';

    let query = sb.from('vw_dashboard_vendas').select('*');
    if (vC !== 'all') query = query.eq('campanha', vC);
    if (vO !== 'all') query = query.eq('origem',   vO);
    if (vM !== 'all') query = query.eq('mes_ano',  vM);
    if (vV !== 'all') query = query.eq('village',  vV);

    const { data, error } = await query;
    if (error) { console.error('Erro ao aplicar filtros:', error); return; }

    renderKPICards(data);
    renderCharts(data);
}

// ============================================================
// KPI CARDS (Usa Feirão para cálculo de gap de metas)
// ============================================================
function drawFixedKPIs() {
    const c = state.consolidado;
    const fat = parseFloat(c.total_faturamento_anual) || 0;
    const fatFeirao = parseFloat(c.total_feirao_2026) || 0;

    animateValue('kpi-faturamento',   0, fat, 1000, true);
    animateValue('kpi-feirao2026',    0, fatFeirao, 1000, true);
    animateValue('kpi-comissao',      0, parseFloat(c.comissao_green_anual)||0, 1000, true);
    animateValue('kpi-transfer',      0, parseFloat(c.total_transfer)||0, 1000, true);
    animateValue('kpi-equipamento',   0, parseFloat(c.total_equipamento)||0, 1000, true);
    animateValue('kpi-taxas',         0, parseFloat(c.total_taxa_inscricao)||0, 1000, true);
    animateValue('kpi-cancelamentos', 0, parseFloat(c.cancelamentos)||0, 1000, true);

    // Gap de metas usa Feirão
    const nextMilestone = state.milestones.find(m => fatFeirao < m.value);
    const gap = nextMilestone ? Math.max(nextMilestone.value - fatFeirao, 0) : 0;
    animateValue('kpi-gap', 0, gap, 1000, true);

    const gapLabel = document.querySelector('#kpi-gap')?.closest('.kpi-card')?.querySelector('.kpi-label');
    if (gapLabel && nextMilestone) {
        gapLabel.textContent = `Falta para ${nextMilestone.label}`;
    } else if (gapLabel) {
        gapLabel.textContent = 'Todas as metas atingidas!';
    }
}

function renderKPICards(dataset) {
    const vC = document.getElementById('filtroCampanha').value;
    const vO = document.getElementById('filtroOrigem').value;
    const vM = document.getElementById('filtroMes').value;
    const vV = document.getElementById('filtroVillage')?.value || 'all';
    const hasFilter = vC !== 'all' || vO !== 'all' || vM !== 'all' || vV !== 'all';

    const fat = dataset.reduce((s, r) => s + (parseFloat(r.valor_total) || 0), 0);
    const fatCard = document.getElementById('kpi-faturamento');
    let badge = document.getElementById('kpi-faturamento-badge');

    if (hasFilter) {
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'kpi-faturamento-badge';
            badge.style.cssText = 'font-size:11px;color:#8FB3D9;margin-top:4px;font-weight:500;';
            fatCard?.parentElement?.appendChild(badge);
        }
        badge.textContent = `Filtrado: ${fmtBRL(fat)}`;
    } else {
        if (badge) badge.remove();
    }
}

function animateValue(id, start, end, duration, isCurrency) {
    const el = document.getElementById(id);
    if (!el) return;
    let t0 = null;
    const step = (ts) => {
        if (!t0) t0 = ts;
        const p = Math.min((ts - t0) / duration, 1);
        const ease = 1 - Math.pow(1 - p, 4);
        const cur = ease * (end - start) + start;
        el.textContent = isCurrency ? fmtBRL(cur) : Math.floor(cur).toLocaleString('pt-BR');
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = isCurrency ? fmtBRL(end) : end.toLocaleString('pt-BR');
    };
    requestAnimationFrame(step);
}

// ============================================================
// AUTO-REFRESH SILENCIOSO — a cada 60s
// ============================================================
function updateTimestamp() {
    const now = new Date();
    const time = 'Atualizado às ' + now.toLocaleTimeString('pt-BR');
    const el = document.getElementById('updateTime');
    const elTs = document.getElementById('ts-updateTime');
    if (el) el.textContent = time;
    if (elTs) elTs.textContent = time;
}

async function silentRefresh() {
    const [r1, r2, r3] = await Promise.all([
        sb.from('consolidado_anual').select('*').eq('ano', 2026).maybeSingle(),
        sb.from('vw_dashboard_vendas').select('*'),
        sb.from('vw_village_resumo').select('village,valor_total,qtd_vendas,comissao_green')
    ]);
    if (!r1.error && r1.data) {
        state.consolidado = r1.data;
        state.fatAnualGlobal = parseFloat(r1.data.total_faturamento_anual || 0);
        state.fatFeiraoGlobal = parseFloat(r1.data.total_feirao_2026 || 0);
        buildMilestones();
        updateGamification();
        drawFixedKPIs();
    }
    if (!r2.error && r2.data) {
        state.vendas = r2.data;
        populateDropdowns();
        applyFilters();
    }
    if (!r3.error && r3.data) {
        state.villageResumo = r3.data;
    }
    updateTimestamp();
}

updateTimestamp();
setInterval(silentRefresh, 60000);

// ============================================================
// CHARTS
// ============================================================
function renderCharts(dataset) {
    const aggVillage = {}, aggVillageCount = {}, aggCampanha = {};

    const villageSource = (state.villageResumo && state.villageResumo.length > 0) ? state.villageResumo : dataset;
    villageSource.forEach(r => {
        const v = r.village || 'N/I';
        aggVillage[v]      = parseFloat(r.valor_total) || 0;
        aggVillageCount[v] = parseInt(r.qtd_vendas)    || 0;
    });

    dataset.forEach(r => {
        const fat = parseFloat(r.valor_total) || 0;
        aggCampanha[r.campanha || 'Outros'] = (aggCampanha[r.campanha || 'Outros'] || 0) + fat;
    });

    const sortedVillageEntries = Object.entries(aggVillage).sort((a, b) => b[1] - a[1]);
    const villageLabels  = sortedVillageEntries.map(([k]) => k);
    const villageValores = sortedVillageEntries.map(([, v]) => v);
    const villageCounts  = villageLabels.map(v => aggVillageCount[v] || 0);

    const villageEl = document.querySelector('.chart-container--village');
    if (villageEl) {
        const isMobile = window.innerWidth <= 480;
        const rowH = isMobile ? 42 : 58;
        const minH = isMobile ? 240 : 320;
        villageEl.style.height = Math.max(minH, villageLabels.length * rowH + 80) + 'px';
    }

    const mode = state.villageViewMode || 'both';
    const villageDatasets = [];
    
    if (mode === 'both' || mode === 'valor') {
        villageDatasets.push({
            label: 'Valor Total (R$)',
            data: villageValores,
            backgroundColor: chartColors.glacial,
            hoverBackgroundColor: chartColors.deep,
            borderRadius: 8,
            yAxisID: 'y',
            xAxisID: 'xValor',
        });
    }

    if (mode === 'both' || mode === 'qtd') {
        villageDatasets.push({
            label: 'Qtd. Vendas',
            data: villageCounts,
            backgroundColor: chartColors.gold,
            hoverBackgroundColor: chartColors.brown,
            borderRadius: 8,
            yAxisID: 'y',
            xAxisID: mode === 'both' ? 'xQtd' : 'xValor',
        });
    }

    buildChart('chartVillages', 'bar', villageLabels, villageDatasets, {
        indexAxis: 'y',
        plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        if (ctx.dataset.label.includes('Valor')) return ' Valor Total: ' + fmtBRL(ctx.parsed.x);
                        return ' Qtd. Vendas: ' + ctx.parsed.x;
                    }
                }
            }
        },
        scales: {
            y: { stacked: false },
            xValor: {
                type: 'linear',
                position: 'bottom',
                display: mode === 'both' || mode === 'valor',
                title: { display: true, text: 'Valor Total (R$)', color: chartColors.glacial },
                ticks: {
                    color: chartColors.glacial,
                    callback: v => fmtCompact(v)
                },
                grid: { color: chartColors.grid }
            },
            xQtd: {
                type: 'linear',
                position: mode === 'both' ? 'top' : 'bottom',
                display: mode === 'both' || mode === 'qtd',
                title: { display: true, text: 'Qtd. Vendas', color: chartColors.gold },
                ticks: {
                    color: chartColors.gold,
                    stepSize: 1,
                    callback: v => Number.isInteger(v) ? v : ''
                },
                grid: { display: mode !== 'both', color: chartColors.grid }
            }
        }
    });

}

function changeVillageView(mode) {
    state.villageViewMode = mode;
    renderCharts(state.vendas);
}

// ============================================================
// MODAL — Origem Detalhado + ROI Mídia Paga
// ============================================================
async function openOrigemModal() {
    const modal = document.getElementById('origemModal');
    modal.classList.add('ori-modal-visible');
    document.body.style.overflow = 'hidden';

    // Render origem list inside modal (reutiliza os dados do state se disponível)
    renderOrigemModalList();

    // Fetch ROI data
    await renderRoiSection();
}

function closeOrigemModal() {
    const modal = document.getElementById('origemModal');
    modal.classList.remove('ori-modal-visible');
    document.body.style.overflow = '';
    // Reseta cache para garantir dados frescos na próxima abertura
    oriState.allMidiaData = null;
    if (oriState.trendChart) { oriState.trendChart.destroy(); oriState.trendChart = null; }
    const trendSection = document.getElementById('oriTrendSection');
    if (trendSection) trendSection.style.display = 'none';
}

// Renderiza a lista de origens no modal (busca dados frescos)
async function renderOrigemModalList() {
    const listEl = document.getElementById('origemModalList');
    if (!listEl) return;

    const { data, error } = await sb
        .from('resumo_origens')
        .select('origem, valor_total');

    if (error || !data) {
        listEl.innerHTML = `<div class="origem-loading" style="color:#e74c3c;">Erro ao carregar.</div>`;
        return;
    }

    const items = data
        .filter(r => parseFloat(r.valor_total) > 0)
        .sort((a, b) => parseFloat(b.valor_total) - parseFloat(a.valor_total));

    if (!items.length) { listEl.innerHTML = `<div class="origem-loading">Sem dados.</div>`; return; }

    const maxVal = parseFloat(items[0].valor_total);
    const total  = items.reduce((s, r) => s + parseFloat(r.valor_total), 0);
    const paleta = ['var(--azul-marinho)','var(--azul-glacial)','var(--dourado-mate)','#34495E','#2ECC71','#E67E22','#9B59B6','#1ABC9C'];

    listEl.innerHTML = items.map((r, i) => {
        const val   = parseFloat(r.valor_total);
        const pct   = ((val / maxVal) * 100).toFixed(1);
        const share = ((val / total) * 100).toFixed(1);
        const cor   = paleta[i % paleta.length];
        return `
        <div class="origem-item">
            <div class="origem-item__header">
                <span class="origem-item__dot" style="background:${cor}"></span>
                <span class="origem-item__name">${r.origem}</span>
                <span class="origem-item__share">${share}%</span>
                <span class="origem-item__value">${fmtBRL(val)}</span>
            </div>
            <div class="origem-item__bar-track">
                <div class="origem-item__bar-fill" style="width:0%;background:${cor};" data-w="${pct}"></div>
            </div>
        </div>`;
    }).join('');

    requestAnimationFrame(() => {
        listEl.querySelectorAll('.origem-item__bar-fill').forEach(bar => {
            requestAnimationFrame(() => { bar.style.width = bar.dataset.w + '%'; });
        });
    });
}

// ============================================================
// MODAL ROI — state local
// ============================================================
const oriState = {
    allMidiaData: null,   // todos os dados da view (sem filtro de ano)
    trendMetric: 'roas',  // 'roas' | 'lucro'
    trendChart: null
};

// Renderiza a seção de ROI com dados da vw_performance_midia
async function renderRoiSection() {
    const el = document.getElementById('oriRoiSection');
    if (!el) return;

    // Busca todos os dados na primeira abertura; reusa nas trocas de ano
    if (!oriState.allMidiaData) {
        el.innerHTML = `<div class="ori-roi-loading">Carregando dados de mídia...</div>`;
        const { data, error } = await sb
            .from('vw_performance_midia')
            .select('campanha, plataforma, data_inicio, investimento, faturamento, lucro_bruto, roi_percentual, roas, ano_referencia');

        if (error) {
            el.innerHTML = `<div class="ori-roi-loading" style="color:#e74c3c;">Erro ao carregar dados de mídia.</div>`;
            return;
        }
        if (!data || data.length === 0) {
            el.innerHTML = `<div class="ori-roi-loading">Nenhum dado de mídia disponível.</div>`;
            return;
        }
        oriState.allMidiaData = data;
    }

    // Filtro de ano
    const anoSel = document.getElementById('oriAnoFilter')?.value || 'all';
    const data = anoSel === 'all'
        ? oriState.allMidiaData
        : oriState.allMidiaData.filter(r => String(r.ano_referencia) === anoSel);

    if (data.length === 0) {
        el.innerHTML = `<div class="ori-roi-loading">Sem dados para o ano selecionado.</div>`;
        document.getElementById('oriTrendSection').style.display = 'none';
        return;
    }

    // ── Totais do período selecionado ──
    const totalInv  = data.reduce((s, r) => s + (parseFloat(r.investimento) || 0), 0);
    const totalFat  = data.reduce((s, r) => s + (parseFloat(r.faturamento)  || 0), 0);
    const roiTotal  = totalInv > 0 ? ((totalFat - totalInv) / totalInv) * 100 : 0;
    const roasTotal = totalInv > 0 ? totalFat / totalInv : 0;

    // ── Totais do ano anterior (para YoY do hero) ──
    let prevData = null;
    if (anoSel !== 'all') {
        const prevAno = String(parseInt(anoSel) - 1);
        prevData = oriState.allMidiaData.filter(r => String(r.ano_referencia) === prevAno);
    }
    const prevInv  = prevData ? prevData.reduce((s,r) => s+(parseFloat(r.investimento)||0),0) : null;
    const prevFat  = prevData ? prevData.reduce((s,r) => s+(parseFloat(r.faturamento)||0),0) : null;
    const prevRoas = prevData && prevData.length
        ? prevData.reduce((s,r)=>s+(parseFloat(r.roas)||0),0)/prevData.length : null;

    const roiColor  = roiTotal >= 0 ? 'var(--roi-positivo)' : 'var(--roi-negativo)';
    const roiPrefix = roiTotal >= 0 ? '+' : '';
    const roiIcon   = roiTotal >= 0
        ? `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`;

    // Helper: badge YoY
    function yoyBadge(curr, prev) {
        if (prev === null || prev === 0) return `<span class="ori-campanha-yoy na">— sem comparativo</span>`;
        const pct = ((curr - prev) / Math.abs(prev)) * 100;
        const cls = pct >= 0 ? 'up' : 'down';
        const sign = pct >= 0 ? '▲' : '▼';
        return `<span class="ori-campanha-yoy ${cls}">${sign} ${Math.abs(pct).toFixed(1)}% vs ano ant.</span>`;
    }

    // ── Agrupar campanhas com YoY ──
    // Usa o nome da campanha como chave para cruzar anos
    const campanhasMap = {};
    oriState.allMidiaData.forEach(r => {
        const key = (r.campanha || 'Campanha') + '|||' + (r.plataforma || '');
        if (!campanhasMap[key]) campanhasMap[key] = {};
        const ano = String(r.ano_referencia);
        if (!campanhasMap[key][ano]) campanhasMap[key][ano] = { inv:0, fat:0, roiSum:0, roasSum:0, count:0 };
        campanhasMap[key][ano].inv    += parseFloat(r.investimento) || 0;
        campanhasMap[key][ano].fat    += parseFloat(r.faturamento)  || 0;
        campanhasMap[key][ano].roiSum += parseFloat(r.roi_percentual) || 0;
        campanhasMap[key][ano].roasSum+= parseFloat(r.roas) || 0;
        campanhasMap[key][ano].count  += 1;
    });

    // Filtra apenas as campanhas presentes no ano selecionado
    el.innerHTML = `
        <div class="ori-roi-hero">
            <div class="ori-roi-hero-left">
                <div class="ori-roi-eyebrow">ROI · Mídia Paga${anoSel !== 'all' ? ' · ' + anoSel : ''}</div>
                <div class="ori-roi-big" style="color:${roiColor}">
                    <span class="ori-roi-icon" style="color:${roiColor}">${roiIcon}</span>
                    ${roiPrefix}${roiTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                </div>
                <div class="ori-roi-caption">Retorno sobre o investimento total em mídia</div>
            </div>
            <div class="ori-roi-hero-right">
                <div class="ori-kpi-pill">
                    <div class="ori-kpi-pill-label">ROAS</div>
                    <div class="ori-kpi-pill-value" style="color:${roiColor}">${roasTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x</div>
                    <div class="ori-kpi-pill-sub">${prevRoas !== null ? yoyBadge(roasTotal, prevRoas) : 'para cada R$1 investido'}</div>
                </div>
                <div class="ori-kpi-pill">
                    <div class="ori-kpi-pill-label">Investimento Total</div>
                    <div class="ori-kpi-pill-value">${fmtBRL(totalInv)}</div>
                    ${prevInv !== null ? `<div class="ori-kpi-pill-sub">${yoyBadge(totalInv, prevInv)}</div>` : ''}
                </div>
                <div class="ori-kpi-pill">
                    <div class="ori-kpi-pill-label">Faturamento Gerado</div>
                    <div class="ori-kpi-pill-value" style="color:var(--verde-esmeralda)">${fmtBRL(totalFat)}</div>
                    ${prevFat !== null ? `<div class="ori-kpi-pill-sub">${yoyBadge(totalFat, prevFat)}</div>` : ''}
                </div>
            </div>
        </div>
    `;

    // Mostra e atualiza o gráfico de tendência
    renderOriTrendChart();
}

// ============================================================
// GRÁFICO DE TENDÊNCIA DO MODAL
// ============================================================
const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const ORI_YEAR_COLORS = { '2024': '#CEAC2D', '2025': '#97B4C2', '2026': '#5e8590' };

function setOriTrendMetric(m) {
    oriState.trendMetric = m;
    document.getElementById('ori-btn-roas')?.classList.toggle('active', m === 'roas');
    document.getElementById('ori-btn-lucro')?.classList.toggle('active', m === 'lucro');
    renderOriTrendChart();
}

function renderOriTrendChart() {
    const trendSection = document.getElementById('oriTrendSection');
    const canvas = document.getElementById('oriTrendChart');
    if (!trendSection || !canvas || !oriState.allMidiaData) return;

    if (oriState.trendChart) { oriState.trendChart.destroy(); oriState.trendChart = null; }

    // Agrupa por ano e mês
    const byYearMonth = {};
    oriState.allMidiaData.forEach(r => {
        const ano = String(r.ano_referencia);
        const d = r.data_inicio ? new Date(r.data_inicio) : null;
        if (!d) return;
        const m = d.getMonth();
        if (!byYearMonth[ano]) byYearMonth[ano] = {};
        if (!byYearMonth[ano][m]) byYearMonth[ano][m] = { roasSum: 0, lucro: 0, count: 0 };
        byYearMonth[ano][m].roasSum += parseFloat(r.roas) || 0;
        byYearMonth[ano][m].lucro   += parseFloat(r.lucro_bruto) || 0;
        byYearMonth[ano][m].count   += 1;
    });

    const anos = Object.keys(byYearMonth).sort();
    if (!anos.length) { trendSection.style.display = 'none'; return; }

    const datasets = anos.map(ano => ({
        label: ano,
        data: MESES_PT.map((_, i) => {
            const slot = byYearMonth[ano][i];
            if (!slot) return null;
            return oriState.trendMetric === 'roas'
                ? slot.roasSum / slot.count
                : slot.lucro;
        }),
        borderColor: ORI_YEAR_COLORS[ano] || '#8FB3D9',
        backgroundColor: (ORI_YEAR_COLORS[ano] || '#8FB3D9') + '22',
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        tension: 0.4,
        spanGaps: true,
        fill: false
    }));

    const isCurrency = oriState.trendMetric === 'lucro';

    // Glossário de métricas — injetado acima do canvas
    const glossaryId = 'oriTrendGlossary';
    let glossEl = document.getElementById(glossaryId);
    if (!glossEl) {
        glossEl = document.createElement('div');
        glossEl.id = glossaryId;
        glossEl.className = 'ori-metric-glossary';
        canvas.parentElement.insertBefore(glossEl, canvas);
    }
    glossEl.innerHTML = oriState.trendMetric === 'roas'
        ? `<span class="ori-gloss-pill">
               <strong>ROAS</strong> (Return on Ad Spend) — quanto de faturamento bruto é gerado para cada R$&nbsp;1 investido em mídia.
               Exemplo: ROAS 4x significa R$&nbsp;4 faturados por R$&nbsp;1 investido.
           </span>`
        : `<span class="ori-gloss-pill">
               <strong>Lucro Bruto</strong> — faturamento gerado pela campanha menos o investimento em mídia, sem descontar custos operacionais.
               Valores positivos indicam campanha superavitária.
           </span>`;

    oriState.trendChart = new Chart(canvas, {
        type: 'line',
        data: { labels: MESES_PT, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: true, position: 'top', labels: { boxWidth: 10, font: { size: 11 } } },
                tooltip: {
                    backgroundColor: 'rgba(255,255,255,0.97)',
                    titleColor: '#102A43',
                    bodyColor: '#486581',
                    borderColor: 'rgba(143,179,217,0.3)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: ctx => {
                            if (ctx.raw === null) return null;
                            const prefix = ctx.dataset.label + ': ';
                            return prefix + (isCurrency
                                ? fmtBRL(ctx.raw)
                                : ctx.raw.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}) + 'x');
                        }
                    }
                }
            },
            scales: {
                x: { grid: { color: 'rgba(16,42,67,0.04)' }, ticks: { font: { size: 10 }, color: '#486581' } },
                y: {
                    grid: { color: 'rgba(16,42,67,0.04)' },
                    ticks: {
                        font: { size: 10 }, color: '#486581',
                        callback: v => isCurrency
                            ? (v >= 1000 ? 'R$'+(v/1000).toFixed(0)+'k' : fmtBRL(v))
                            : v.toFixed(1) + 'x'
                    }
                }
            }
        }
    });

    trendSection.style.display = 'block';
}

// Fechar modal com Esc
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('origemModal')?.classList.contains('ori-modal-visible')) {
        closeOrigemModal();
    }
});

async function renderOrigemCard() {
    const listEl = document.getElementById('origemList');
    if (!listEl) return;

    const { data, error } = await sb
        .from('resumo_origens')
        .select('origem, valor_total');

    if (error) {
        listEl.innerHTML = `<div class="origem-loading" style="color:#e74c3c;">Erro ao carregar dados.</div>`;
        console.warn('Erro resumo_origens:', error);
        return;
    }

    // Filtrar zeros e ordenar desc
    const items = (data || [])
        .filter(r => parseFloat(r.valor_total) > 0)
        .sort((a, b) => parseFloat(b.valor_total) - parseFloat(a.valor_total));

    if (items.length === 0) {
        listEl.innerHTML = `<div class="origem-loading">Nenhum dado disponível.</div>`;
        return;
    }

    const maxVal = parseFloat(items[0].valor_total);
    const total  = items.reduce((s, r) => s + parseFloat(r.valor_total), 0);

    const paleta = [
        'var(--azul-marinho)',
        'var(--azul-glacial)',
        'var(--dourado-mate)',
        '#34495E',
        '#2ECC71',
        '#E67E22',
        '#9B59B6',
        '#1ABC9C'
    ];

    listEl.innerHTML = items.map((r, i) => {
        const val   = parseFloat(r.valor_total);
        const pct   = ((val / maxVal) * 100).toFixed(1);
        const share = ((val / total) * 100).toFixed(1);
        const cor   = paleta[i % paleta.length];
        return `
        <div class="origem-item">
            <div class="origem-item__header">
                <span class="origem-item__dot" style="background:${cor}"></span>
                <span class="origem-item__name">${r.origem}</span>
                <span class="origem-item__share">${share}%</span>
                <span class="origem-item__value">${fmtBRL(val)}</span>
            </div>
            <div class="origem-item__bar-track">
                <div class="origem-item__bar-fill"
                     style="width:0%; background:${cor};"
                     data-w="${pct}">
                </div>
            </div>
        </div>`;
    }).join('');

    // Animar barras após render
    requestAnimationFrame(() => {
        listEl.querySelectorAll('.origem-item__bar-fill').forEach(bar => {
            requestAnimationFrame(() => {
                bar.style.width = bar.dataset.w + '%';
            });
        });
    });
}


function renderVendedoresChart() {
    const aggVendedor = {}, aggCount = {};
    const dataset = state.vendasReservas || [];
    
    dataset.forEach(r => {
        const v = r.vendedora || 'N/I';
        aggVendedor[v] = (aggVendedor[v] || 0) + (parseFloat(r.valor_total) || 0);
        aggCount[v] = (aggCount[v] || 0) + 1;
    });

    const sorted = Object.entries(aggVendedor).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(([k]) => k);
    const valores = sorted.map(([,v]) => v);
    const counts = labels.map(l => aggCount[l]);

    buildChart('chartVendedores', 'bar', labels, [
        {
            label: 'Valor (R$)',
            data: valores,
            backgroundColor: chartColors.deep,
            hoverBackgroundColor: chartColors.glacial,
            borderRadius: 8,
            yAxisID: 'y',
            xAxisID: 'xValor',
        },
        {
            label: 'Qtd. Vendas',
            data: counts,
            backgroundColor: chartColors.gold,
            hoverBackgroundColor: chartColors.brown,
            borderRadius: 8,
            yAxisID: 'y',
            xAxisID: 'xQtd',
        }
    ], {
        indexAxis: 'y',
        plugins: {
            legend: { display: true, position: 'top' },
            tooltip: {
                callbacks: {
                    label: function(ctx) {
                        if (ctx.datasetIndex === 0) return ' Valor: ' + fmtBRL(ctx.parsed.x);
                        return ' Qtd. Vendas: ' + ctx.parsed.x;
                    }
                }
            }
        },
        scales: {
            y: { stacked: false },
            xValor: {
                type: 'linear', position: 'bottom', display: true,
                ticks: { color: chartColors.glacial, callback: v => fmtCompact(v) },
                grid: { color: chartColors.grid }
            },
            xQtd: {
                type: 'linear', position: 'top', display: true,
                ticks: { color: chartColors.gold, stepSize: 1, callback: v => Number.isInteger(v) ? v : '' },
                grid: { display: false }
            }
        }
    });
}

function renderDatasViagemChart() {
    const dataset = state.vendasReservas || [];
    const filterEl = document.getElementById('filtroDatasVillage');
    const villageFilter = filterEl ? filterEl.value : 'all';
    
    let filtered = dataset;
    if (villageFilter !== 'all') {
        filtered = dataset.filter(r => r.village === villageFilter);
    }

    const aggDatasMonth = {};
    const aggDatasWeek = {};
    const monthsName = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

    filtered.forEach(r => {
        if (!r.data_in) return;
        const d = new Date(r.data_in);
        if (isNaN(d.valueOf())) return;
        
        const mObj = d.getMonth();
        const mStr = (mObj + 1).toString().padStart(2, '0');
        const yFull = d.getFullYear();
        
        // Month aggregation for Chart
        const isMobile = window.innerWidth <= 480;
        const monthLabel = isMobile ? `${monthsName[mObj].substring(0,3)} ${yFull.toString().slice(-2)}` : `${monthsName[mObj]} ${yFull}`;
        const sortKeyMonth = `${yFull}-${mStr}`;
        const finalMonthLabel = `${sortKeyMonth}|${monthLabel}`;
        
        aggDatasMonth[finalMonthLabel] = (aggDatasMonth[finalMonthLabel] || 0) + 1;

        // Week aggregation for Insight (Semana 1..4)
        const day = d.getDate();
        let weekNum = Math.ceil(day / 7);
        if (weekNum > 4) weekNum = 4; // Ajuste para que dias 29, 30, 31 contem na semana 4
        
        const weekLabel = `Semana ${weekNum} de ${monthsName[mObj]} ${yFull}`;
        aggDatasWeek[weekLabel] = (aggDatasWeek[weekLabel] || 0) + 1;
    });

    const entriesMonth = Object.entries(aggDatasMonth).sort((a,b) => a[0].localeCompare(b[0]));
    
    const labels = entriesMonth.map(e => e[0].split('|')[1]);
    const data = entriesMonth.map(e => e[1]);
    
    const insightEl = document.getElementById('datasViagemInsight');
    if (insightEl) {
        const entriesWeek = Object.entries(aggDatasWeek);
        if (entriesWeek.length > 0) {
            const sortedByCount = [...entriesWeek].sort((a,b) => b[1] - a[1]);
            const topWeek = sortedByCount[0];
            insightEl.innerHTML = `💡 A data mais procurada é a <strong>${topWeek[0]}</strong> com <strong>${topWeek[1]}</strong> reservas.`;
        } else {
            insightEl.innerHTML = `Nenhuma data encontrada para este filtro.`;
        }
    }

    buildChart('chartDatas', 'line', labels, [{
        label: 'Reservas Futuras',
        data: data,
        borderColor: chartColors.deep,
        backgroundColor: 'rgba(94,133,144,0.08)',
        borderWidth: 2,
        pointBackgroundColor: chartColors.deep,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.4
    }], {
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => ' Reservas: ' + ctx.parsed.y
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { stepSize: 1 },
                grid: { color: chartColors.grid }
            },
            x: {
                grid: { display: false }
            }
        }
    });
}

function buildChart(id, type, labels, datasets, options) {
    const ctx = document.getElementById(id).getContext('2d');
    if (state.chartInstances[id]) state.chartInstances[id].destroy();
    state.chartInstances[id] = new Chart(ctx, {
        type, data: { labels, datasets },
        options: Object.assign({ responsive: true, maintainAspectRatio: false }, options)
    });
}

// ============================================================
// TABLET SLIDESHOW
// ============================================================
const slideshow = {
    active: false,
    paused: false,
    currentSlide: 0,
    timer: null,
    INTERVAL: 10000,
    charts: {}
};

// Calcula porcentagem relativa à meta anterior
function calcMetaPctRelative(fat, milestone, milestones) {
    const idx = milestones.indexOf(milestone);
    const prevValue = idx > 0 ? milestones[idx - 1].value : 0;
    const range = milestone.value - prevValue;
    if (range <= 0) return 100;
    const progress = fat - prevValue;
    return Math.max(0, Math.min((progress / range) * 100, 100)).toFixed(1);
}

function buildSlidesData() {
    const c = state.consolidado;
    const fat = state.fatFeiraoGlobal; // Metas baseadas no Feirão
    const fatAnual = state.fatAnualGlobal;
    const next = state.milestones.find(m => fat < m.value);
    const nextLabel = next ? next.label : 'Todas atingidas';
    const diff = next ? Math.max(next.value - fat, 0) : 0;
    const pct = next
        ? Math.min(((fat / next.value) * 100), 100).toFixed(1)
        : 100;

    const aggVillage = {}, aggOrigem = {};
    state.vendas.forEach(r => {
        const v = parseFloat(r.valor_total) || 0;
        aggVillage[r.village || 'N/I']  = (aggVillage[r.village || 'N/I']  || 0) + v;
        aggOrigem[r.origem  || 'Direto'] = (aggOrigem[r.origem  || 'Direto'] || 0) + v;
    });

    const villageEntries = Object.entries(aggVillage).sort((a,b) => b[1]-a[1]);
    const origemEntries  = Object.entries(aggOrigem).sort((a,b) => b[1]-a[1]);

    return [
        // Slide 1 — Dual hero: Feirão (destaque) + Faturamento Anual
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
                            <div class="ts-hero-value ts-hero-value--secondary">${fmtBRL(fatAnual)}</div>
                        </div>
                    </div>
                    <div class="ts-meta-chip ${next ? '' : 'achieved'}">
                        ${next
                            ? `Faltam <strong>${fmtBRL(diff)}</strong> para <strong>${nextLabel}</strong>`
                            : '🏆 Todas as metas atingidas!'}
                    </div>
                    <div class="ts-progress-wrap">
                        <div class="ts-progress-track">
                            <div class="ts-progress-fill" style="width:0%" data-pct="${pct}"></div>
                        </div>
                        <div class="ts-progress-label">${pct}% ${next ? `até ${nextLabel}` : ''}</div>
                    </div>
                `;
                setTimeout(() => {
                    const bar = el.querySelector('.ts-progress-fill');
                    if (bar) bar.style.width = pct + '%';
                }, 80);
            }
        },

        // Slide 2 — KPIs grid
        {
            id: 'slide-kpis',
            render: (el) => {
                const items = [
                    { label: 'Feirão 2026',       value: parseFloat(c.total_feirao_2026)||0,       color: '#C5A028' },
                    { label: 'Comissão Green',     value: parseFloat(c.comissao_green_anual)||0,    color: '#2ECC71' },
                    { label: 'Transfer',           value: parseFloat(c.total_transfer)||0,          color: '#8FB3D9' },
                    { label: 'Equipamento',        value: parseFloat(c.total_equipamento)||0,       color: '#8FB3D9' },
                    { label: 'Taxa Inscrição',     value: parseFloat(c.total_taxa_inscricao)||0,    color: '#C5A028' },
                    { label: 'Cancelamentos',      value: parseFloat(c.cancelamentos)||0,           color: '#FF7F50' },
                ];
                el.innerHTML = `
                    <div class="ts-eyebrow">Breakdown de Receita</div>
                    <div class="ts-kpi-grid">
                        ${items.map(it => `
                            <div class="ts-kpi-item">
                                <div class="ts-kpi-bar" style="background:${it.color}"></div>
                                <div class="ts-kpi-label">${it.label}</div>
                                <div class="ts-kpi-val">${fmtBRL(it.value)}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
        },

        // Slide 3 — Villages ranking
        {
            id: 'slide-villages',
            render: (el) => {
                const total = villageEntries.reduce((s,[,v]) => s+v, 0) || 1;
                el.innerHTML = `
                    <div class="ts-eyebrow">Vendas por Village</div>
                    <div class="ts-ranking">
                        ${villageEntries.map(([name, val], i) => {
                            const pctV = ((val/total)*100).toFixed(1);
                            return `
                            <div class="ts-rank-row">
                                <div class="ts-rank-num">${i+1}</div>
                                <div class="ts-rank-info">
                                    <div class="ts-rank-name">${name}</div>
                                    <div class="ts-rank-bar-wrap">
                                        <div class="ts-rank-bar" style="width:0%" data-w="${pctV}"></div>
                                    </div>
                                </div>
                                <div class="ts-rank-val">${fmtBRL(val)}</div>
                            </div>`;
                        }).join('')}
                    </div>
                `;
                setTimeout(() => {
                    el.querySelectorAll('.ts-rank-bar').forEach(b => {
                        b.style.width = b.dataset.w + '%';
                    });
                }, 80);
            }
        },

        // Slide 4 — Origem ranking
        {
            id: 'slide-origem',
            render: (el) => {
                const total = origemEntries.reduce((s,[,v]) => s+v, 0) || 1;
                el.innerHTML = `
                    <div class="ts-eyebrow">Distribuição por Origem</div>
                    <div class="ts-ranking">
                        ${origemEntries.map(([name, val], i) => {
                            const pctV = ((val/total)*100).toFixed(1);
                            return `
                            <div class="ts-rank-row">
                                <div class="ts-rank-num">${i+1}</div>
                                <div class="ts-rank-info">
                                    <div class="ts-rank-name">${name}</div>
                                    <div class="ts-rank-bar-wrap">
                                        <div class="ts-rank-bar" style="width:0%" data-w="${pctV}" style="background:#C5A028"></div>
                                    </div>
                                </div>
                                <div class="ts-rank-val">${fmtBRL(val)}</div>
                            </div>`;
                        }).join('')}
                    </div>
                `;
                setTimeout(() => {
                    el.querySelectorAll('.ts-rank-bar').forEach(b => {
                        b.style.width = b.dataset.w + '%';
                    });
                }, 80);
            }
        },

        // Slide 5 — Metas mapa (porcentagem relativa à meta anterior)
        {
            id: 'slide-metas',
            render: (el) => {
                el.innerHTML = `
                    <div class="ts-eyebrow">Mapa de Metas</div>
                    <div class="ts-metas-list">
                        ${state.milestones.map(m => {
                            const achieved = fat >= m.value;
                            const isCurrent = !achieved && m === next;
                            const mPct = calcMetaPctRelative(fat, m, state.milestones);
                            return `
                            <div class="ts-meta-row ${achieved ? 'ts-meta-done' : ''} ${isCurrent ? 'ts-meta-current' : ''}">
                                <div class="ts-meta-icon">${achieved ? '✅' : isCurrent ? '🎯' : '⬜'}</div>
                                <div class="ts-meta-info">
                                    <div class="ts-meta-name">${m.label}</div>
                                    <div class="ts-meta-target">${fmtBRL(m.value)}</div>
                                </div>
                                <div class="ts-meta-pct">${achieved ? '100%' : mPct + '%'}</div>
                            </div>`;
                        }).join('')}
                    </div>
                `;
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
    const dots = document.querySelectorAll('.ts-dot');

    content.style.opacity = '0';
    content.style.transform = 'translateY(12px)';

    setTimeout(() => {
        slide.render(content);
        content.style.opacity = '1';
        content.style.transform = 'translateY(0)';
    }, 220);

    dots.forEach((d, i) => d.classList.toggle('active', i === slideshow.currentSlide));

    // Progress bar timer reset (só se não estiver pausado)
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
    slideshow.timer = setInterval(() => {
        showSlide(slideshow.currentSlide + 1);
    }, slideshow.INTERVAL);
}

function startSlideshow() {
    if (slideshow.active) return;
    slideshow.active = true;
    slideshow.paused = false;

    const overlay = document.getElementById('tablet-slideshow');
    overlay.classList.add('ts-visible');
    document.body.style.overflow = 'hidden';

    // Fullscreen
    const panel = document.querySelector('.ts-panel');
    if (panel.requestFullscreen) {
        panel.requestFullscreen().catch(() => {});
    } else if (panel.webkitRequestFullscreen) {
        panel.webkitRequestFullscreen();
    }

    // Build dots
    const slides = buildSlidesData();
    const dotsEl = document.getElementById('ts-dots');
    dotsEl.innerHTML = slides.map((_, i) =>
        `<div class="ts-dot${i===0 ? ' active' : ''}" onclick="showSlide(${i})"></div>`
    ).join('');

    // Update pause button state
    updatePauseButton();

    showSlide(0);
    startAutoAdvance();
}

function stopSlideshow() {
    slideshow.active = false;
    slideshow.paused = false;
    clearInterval(slideshow.timer);
    slideshow.timer = null;

    // Exit fullscreen
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    } else if (document.webkitFullscreenElement) {
        document.webkitExitFullscreen();
    }

    const overlay = document.getElementById('tablet-slideshow');
    overlay.classList.remove('ts-visible');
    document.body.style.overflow = '';
}

function togglePause() {
    slideshow.paused = !slideshow.paused;
    const prog = document.getElementById('ts-timer-bar');

    if (slideshow.paused) {
        clearInterval(slideshow.timer);
        slideshow.timer = null;
        if (prog) {
            // Freeze the timer bar at current position
            const computed = getComputedStyle(prog);
            const currentWidth = computed.width;
            prog.style.transition = 'none';
            prog.style.width = currentWidth;
        }
    } else {
        // Resume
        if (prog) {
            setTimeout(() => {
                prog.style.transition = `width ${slideshow.INTERVAL}ms linear`;
                prog.style.width = '100%';
            }, 50);
        }
        startAutoAdvance();
    }
    updatePauseButton();
}

function updatePauseButton() {
    const btn = document.getElementById('ts-pause-btn');
    if (!btn) return;
    if (slideshow.paused) {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21"/></svg>';
        btn.title = 'Retomar (Espaço)';
    } else {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="6" y1="4" x2="6" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/></svg>';
        btn.title = 'Pausar (Espaço)';
    }
}

// Keyboard navigation
document.addEventListener('keydown', (e) => {
    if (!slideshow.active) return;
    if (e.key === 'Escape') stopSlideshow();
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        togglePause();
    }
    if (e.key === 'ArrowRight') {
        clearInterval(slideshow.timer);
        showSlide(slideshow.currentSlide + 1);
        if (!slideshow.paused) startAutoAdvance();
    }
    if (e.key === 'ArrowLeft') {
        clearInterval(slideshow.timer);
        showSlide(slideshow.currentSlide - 1);
        if (!slideshow.paused) startAutoAdvance();
    }
});

// Listen for fullscreen exit (e.g. pressing Esc in fullscreen)
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && slideshow.active) {
        stopSlideshow();
    }
});

// Touch swipe support for slideshow
(function() {
    let touchStartX = 0;
    let touchStartY = 0;
    const MIN_SWIPE = 50;

    document.addEventListener('touchstart', (e) => {
        if (!slideshow.active) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!slideshow.active) return;
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        // Only horizontal swipes (ignore vertical scroll)
        if (Math.abs(dx) > MIN_SWIPE && Math.abs(dx) > Math.abs(dy)) {
            clearInterval(slideshow.timer);
            if (dx < 0) {
                showSlide(slideshow.currentSlide + 1); // swipe left = next
            } else {
                showSlide(slideshow.currentSlide - 1); // swipe right = prev
            }
            if (!slideshow.paused) startAutoAdvance();
        }
    }, { passive: true });
})();
