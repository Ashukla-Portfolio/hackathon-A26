import {
  Component, OnDestroy, AfterViewInit,
  ChangeDetectorRef, ElementRef, ViewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService, QueryResponse, OrgProfile } from './api.service';

declare const Plotly: any;

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [FormsModule, CommonModule],
  template: `
    <div class="shell">

      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <span class="wordmark">AGENCY 26</span>
          <span class="divider">|</span>
          <span class="subtitle">Funding Loop Intelligence</span>
        </div>
        <div class="header-right">
          @if (lastUpdated) {
            <span class="timestamp">Last query {{ lastUpdated }}</span>
          }
        </div>
      </header>

      <!-- Query bar -->
      <div class="query-bar">
        <textarea
          class="query-input"
          [(ngModel)]="question"
          (keydown.meta.enter)="submit()"
          (keydown.control.enter)="submit()"
          placeholder="Ask about circular funding patterns… e.g. Which charities have the highest risk scores?"
          rows="2"
        ></textarea>
        <button class="query-btn" (click)="submit()" [disabled]="loading || !question.trim()">
          @if (loading) { <span class="spinner"></span> }
          @else { ASK }
        </button>
      </div>

      @if (error) {
        <div class="error-bar">{{ error }}</div>
      }

      @if (response) {

        <!-- Summary strip -->
        <div class="summary-strip">
          <span class="summary-text">{{ response.summary }}</span>
          @if (response.percentage_stat) {
            <span class="pct-badge">{{ response.percentage_stat }}</span>
          }
        </div>

        <!-- Stat callouts -->
        <div class="stats-row">
          <div class="stat-card">
            <div class="stat-value">{{ formatCount(response.stats.total_loops) }}</div>
            <div class="stat-label">Funding Loops</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ formatDollars(response.stats.total_circular_amt) }}</div>
            <div class="stat-label">Circular Flow</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ response.stats.avg_risk_score }}</div>
            <div class="stat-label">Avg Risk Score</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ response.stats.total_orgs }}</div>
            <div class="stat-label">Orgs in Focus</div>
          </div>
        </div>

        <!-- Charts grid -->
        <div class="charts-grid">
          <div class="chart-card chart-bar">
            <div class="chart-title">Top Organizations</div>
            <div class="chart-subtitle">Click a bar to view profile</div>
            <div #barDiv class="chart-div"></div>
          </div>
          <div class="chart-card chart-scatter">
            <div class="chart-title">Risk vs Circular Funding</div>
            <div class="chart-subtitle">Click a point to view profile</div>
            <div #scatterDiv class="chart-div"></div>
          </div>
          <div class="chart-card chart-box">
            <div class="chart-title">Loop Length Distribution</div>
            <div #boxDiv class="chart-div chart-div-short"></div>
          </div>
        </div>

      }

      <!-- Profile card overlay -->
      @if (selectedProfile) {
        <div class="profile-overlay" (click)="clearProfile()">
          <div class="profile-card" (click)="$event.stopPropagation()">
            <button class="profile-close" (click)="clearProfile()">✕</button>
            <div class="profile-name">{{ selectedProfile.legal_name }}</div>
            <div class="profile-meta">
              Fiscal Year {{ selectedProfile.fiscal_year }}
              · Risk Score
              <span [class]="riskClass(selectedProfile.score)">
                {{ selectedProfile.score }}/30
              </span>
            </div>

            <div class="profile-stats">
              <div class="pstat">
                <div class="pstat-val">{{ formatDollars(selectedProfile.revenue) }}</div>
                <div class="pstat-lbl">Revenue</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatDollars(selectedProfile.total_circular_amt) }}</div>
                <div class="pstat-lbl">Circular $</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ selectedProfile.total_loops }}</div>
                <div class="pstat-lbl">Total Loops</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatPct(selectedProfile.broad_overhead_pct) }}</div>
                <div class="pstat-lbl">Overhead %</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatDollars(selectedProfile.circular_inflow) }}</div>
                <div class="pstat-lbl">Circ. Inflow</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatPct(inflowPct(selectedProfile)) }}</div>
                <div class="pstat-lbl">Inflow / Revenue</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatDollars(selectedProfile.program_spending) }}</div>
                <div class="pstat-lbl">Program Spend</div>
              </div>
              <div class="pstat">
                <div class="pstat-val">{{ formatDollars(selectedProfile.admin_spending) }}</div>
                <div class="pstat-lbl">Admin Spend</div>
              </div>
            </div>

            <div class="loop-breakdown">
              <div class="lb-title">Loop Breakdown</div>
              <div class="lb-bars">
                @for (hop of hopBreakdown(selectedProfile); track hop.label) {
                  <div class="lb-row">
                    <span class="lb-label">{{ hop.label }}</span>
                    <div class="lb-bar-wrap">
                      <div class="lb-bar"
                           [style.width]="hop.pct + '%'"
                           [style.background]="hop.color">
                      </div>
                    </div>
                    <span class="lb-count">{{ hop.count }}</span>
                  </div>
                }
              </div>
            </div>

          </div>
        </div>
      }

      <!-- Empty state -->
      @if (!response && !loading) {
        <div class="empty-state">
          <div class="empty-icon">⬡</div>
          <div class="empty-text">Ask a question to explore funding loop patterns</div>
          <div class="empty-hints">
            <span (click)="setQuestion('Which charities have the highest risk scores?')">
              Highest risk scores
            </span>
            <span (click)="setQuestion('Show me government-funded charities in funding loops')">
              Govt-funded orgs in loops
            </span>
            <span (click)="setQuestion('Which charities have the most reciprocal funding loops?')">
              Reciprocal loops
            </span>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@300;400;500;600&display=swap');

    :host { display: block; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    .shell {
      min-height: 100vh;
      background: #0d0f14;
      color: #e8eaf0;
      font-family: 'DM Sans', sans-serif;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 40px;
      border-bottom: 1px solid #1e2130;
      background: #0a0c10;
    }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .wordmark {
      font-family: 'DM Mono', monospace;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 0.15em;
      color: #e8b84b;
    }
    .divider { color: #2a2d3a; font-size: 18px; }
    .subtitle { font-size: 13px; color: #6b7280; }
    .timestamp { font-family: 'DM Mono', monospace; font-size: 11px; color: #3d4257; }

    .query-bar {
      display: flex;
      gap: 12px;
      padding: 24px 40px;
      background: #0a0c10;
      border-bottom: 1px solid #1e2130;
    }
    .query-input {
      flex: 1;
      background: #13161f;
      border: 1px solid #1e2130;
      border-radius: 6px;
      color: #e8eaf0;
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      padding: 12px 16px;
      resize: none;
      line-height: 1.5;
      transition: border-color 0.2s;
    }
    .query-input:focus { outline: none; border-color: #e8b84b; }
    .query-input::placeholder { color: #3d4257; }

    .query-btn {
      padding: 0 28px;
      background: #e8b84b;
      color: #0a0c10;
      border: none;
      border-radius: 6px;
      font-family: 'DM Mono', monospace;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.1em;
      cursor: pointer;
      transition: background 0.2s;
      min-width: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .query-btn:hover:not(:disabled) { background: #f0c95a; }
    .query-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .spinner {
      width: 14px; height: 14px;
      border: 2px solid #0a0c10;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-bar {
      background: #2d0f0f;
      color: #f87171;
      padding: 10px 40px;
      font-size: 13px;
    }

    .summary-strip {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 14px 40px;
      background: #0f1218;
      border-bottom: 1px solid #1e2130;
    }
    .summary-text { font-size: 13px; color: #9ca3af; line-height: 1.5; flex: 1; }
    .pct-badge {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      background: #1a2035;
      color: #e8b84b;
      padding: 4px 10px;
      border-radius: 20px;
      white-space: nowrap;
      border: 1px solid #2a3050;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: #1e2130;
      border-bottom: 1px solid #1e2130;
    }
    .stat-card {
      background: #0d0f14;
      padding: 24px 32px;
      text-align: center;
    }
    .stat-value {
      font-family: 'DM Mono', monospace;
      font-size: 28px;
      font-weight: 500;
      color: #e8eaf0;
      line-height: 1;
      margin-bottom: 8px;
    }
    .stat-label {
      font-size: 11px;
      color: #4b5268;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #1e2130;
      margin-top: 1px;
    }
    .chart-card {
      background: #0d0f14;
      padding: 28px;
    }
    .chart-bar  { grid-column: 1; grid-row: 1; }
    .chart-scatter { grid-column: 2; grid-row: 1; }
    .chart-box { grid-column: 1 / -1; grid-row: 2; }

    .chart-title {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #4b5268;
      margin-bottom: 2px;
    }
    .chart-subtitle {
      font-size: 11px;
      color: #2a2d3a;
      margin-bottom: 12px;
    }
    .chart-div { width: 100%; height: 360px; }
    .chart-div-short { height: 220px; }

    /* Profile overlay */
    .profile-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .profile-card {
      background: #13161f;
      border: 1px solid #1e2130;
      border-radius: 12px;
      padding: 32px;
      width: 640px;
      max-width: 90vw;
      max-height: 85vh;
      overflow-y: auto;
      position: relative;
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(16px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    .profile-close {
      position: absolute;
      top: 16px; right: 16px;
      background: none;
      border: none;
      color: #4b5268;
      font-size: 16px;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
    }
    .profile-close:hover { color: #e8eaf0; }

    .profile-name {
      font-size: 18px;
      font-weight: 600;
      color: #e8eaf0;
      margin-bottom: 6px;
      padding-right: 40px;
      line-height: 1.3;
    }
    .profile-meta {
      font-size: 12px;
      color: #4b5268;
      margin-bottom: 28px;
      font-family: 'DM Mono', monospace;
    }
    .risk-low { color: #4ade80; }
    .risk-med { color: #e8b84b; }
    .risk-high { color: #f87171; }

    .profile-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: #1e2130;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 24px;
    }
    .pstat { background: #0d0f14; padding: 16px; text-align: center; }
    .pstat-val {
      font-family: 'DM Mono', monospace;
      font-size: 15px;
      color: #e8eaf0;
      margin-bottom: 4px;
    }
    .pstat-lbl {
      font-size: 10px;
      color: #4b5268;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .loop-breakdown { margin-top: 4px; }
    .lb-title {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #4b5268;
      margin-bottom: 12px;
    }
    .lb-bars { display: flex; flex-direction: column; gap: 8px; }
    .lb-row { display: flex; align-items: center; gap: 10px; }
    .lb-label {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: #6b7280;
      width: 48px;
      flex-shrink: 0;
    }
    .lb-bar-wrap {
      flex: 1;
      height: 6px;
      background: #1e2130;
      border-radius: 3px;
      overflow: hidden;
    }
    .lb-bar { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .lb-count {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      color: #4b5268;
      width: 28px;
      text-align: right;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 100px 40px;
      gap: 16px;
    }
    .empty-icon { font-size: 40px; color: #1e2130; }
    .empty-text { font-size: 14px; color: #3d4257; }
    .empty-hints {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 8px;
    }
    .empty-hints span {
      font-size: 12px;
      color: #4b5268;
      border: 1px solid #1e2130;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: 'DM Mono', monospace;
    }
    .empty-hints span:hover { border-color: #e8b84b; color: #e8b84b; }
  `]
})
export class DashboardComponent implements OnDestroy, AfterViewInit {
  @ViewChild('barDiv')     barDiv!:     ElementRef<HTMLDivElement>;
  @ViewChild('scatterDiv') scatterDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('boxDiv')     boxDiv!:     ElementRef<HTMLDivElement>;

  question      = '';
  loading       = false;
  error         = '';
  response:       QueryResponse | null = null;
  selectedProfile: OrgProfile  | null = null;
  lastUpdated   = '';

  private plotlyLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    font:          { family: 'DM Mono, monospace', color: '#6b7280', size: 11 },
    margin:        { t: 10, b: 40, l: 10, r: 10 },
    xaxis: {
      gridcolor: '#1e2130', zerolinecolor: '#1e2130',
      tickfont: { color: '#4b5268', size: 10 }
    },
    yaxis: {
      gridcolor: '#1e2130', zerolinecolor: '#1e2130',
      tickfont: { color: '#4b5268', size: 10 }
    },
    showlegend: false,
  };

  private plotlyConfig = {
    displayModeBar: false,
    responsive: true,
  };

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}
  ngAfterViewInit() {}
  ngOnDestroy()    { this.purgePlots(); }

  setQuestion(q: string) { this.question = q; this.submit(); }

  submit() {
    if (!this.question.trim() || this.loading) return;
    this.loading       = true;
    this.error         = '';
    this.response      = null;
    this.selectedProfile = null;

    this.api.query(this.question).subscribe({
      next: (res) => {
        this.response    = { ...res };
        this.loading     = false;
        this.lastUpdated = new Date().toLocaleTimeString();
        this.cdr.detectChanges();
        setTimeout(() => this.buildCharts(), 80);
      },
      error: (err) => {
        this.error   = err?.error?.detail ?? 'Backend unreachable. Is uvicorn running?';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearProfile() { this.selectedProfile = null; }

  // ── Plotly chart builders ───────────────────────────────────

  private purgePlots() {
    try {
      if (this.barDiv?.nativeElement)     Plotly.purge(this.barDiv.nativeElement);
      if (this.scatterDiv?.nativeElement) Plotly.purge(this.scatterDiv.nativeElement);
      if (this.boxDiv?.nativeElement)     Plotly.purge(this.boxDiv.nativeElement);
    } catch (_) {}
  }

  private riskColor(score: number): string {
    if (score >= 20) return '#f87171';
    if (score >= 10) return '#e8b84b';
    return '#4ade80';
  }

  private buildCharts() {
    if (!this.response) return;
    this.purgePlots();
    this.buildBar();
    this.buildScatter();
    this.buildBox();
  }

  private buildBar() {
    const results = this.response!.results;
    if (!results.length || !this.barDiv?.nativeElement) return;

    const cols      = Object.keys(results[0]);
    const metricCol = cols[1] ?? cols[0];

    const labels = results.map(r =>
      String(r['organization'] ?? '').slice(0, 35)
    ).reverse();

    const values = results.map(r => Number(r[metricCol] ?? 0)).reverse();
    const scores = results.map(r => Number(r['accountability_risk'] ?? 0)).reverse();
    const colors = scores.map(s => this.riskColor(s));

    const trace = {
      type:        'bar',
      orientation: 'h',
      x:    values,
      y:    labels,
      marker: { color: colors, opacity: 0.85 },
      hovertemplate: '<b>%{y}</b><br>%{x:,.0f}<extra></extra>',
    };

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 40, l: 200, r: 20 },
      yaxis: {
        ...this.plotlyLayout.yaxis,
        automargin: true,
        tickfont: { color: '#9ca3af', size: 10 },
      },
    };

    Plotly.newPlot(this.barDiv.nativeElement, [trace], layout, this.plotlyConfig)
      .then((el: any) => {
        el.on('plotly_click', (data: any) => {
          const pt    = data.points[0];
          const label = pt.y as string;
          const idx   = labels.indexOf(label);
          const origIdx = results.length - 1 - idx;
          const orgName = String(results[origIdx]['organization'] ?? '');
          this.showProfile(orgName);
        });
      });
  }

  private buildScatter() {
    const results = this.response!.results;
    if (!results.length || !this.scatterDiv?.nativeElement) return;

    const x      = results.map(r => Number(r['circular_amt']        ?? r['total_circular_amt'] ?? 0));
    const y      = results.map(r => Number(r['accountability_risk']  ?? 0));
    const size   = results.map(r => Math.max(6, Math.min(30, Number(r['funding_loops'] ?? 1) * 0.5)));
    const labels = results.map(r => String(r['organization'] ?? ''));
    const colors = y.map(s => this.riskColor(s));

    const trace = {
      type: 'scatter',
      mode: 'markers',
      x, y,
      text:          labels,
      marker:        { color: colors, size, opacity: 0.8, line: { width: 0 } },
      hovertemplate: '<b>%{text}</b><br>Risk: %{y}<br>Circular $: %{x:,.0f}<extra></extra>',
    };

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 50, l: 50, r: 20 },
      xaxis: {
        ...this.plotlyLayout.xaxis,
        title: { text: 'Circular $', font: { color: '#4b5268', size: 10 } },
        tickformat: '$.2s',
      },
      yaxis: {
        ...this.plotlyLayout.yaxis,
        title: { text: 'Risk Score', font: { color: '#4b5268', size: 10 } },
        range: [0, 31],
      },
    };

    Plotly.newPlot(this.scatterDiv.nativeElement, [trace], layout, this.plotlyConfig)
      .then((el: any) => {
        el.on('plotly_click', (data: any) => {
          const pt      = data.points[0];
          const orgName = pt.text as string;
          this.showProfile(orgName);
        });
      });
  }

  private buildBox() {
    const results = this.response!.results;
    if (!results.length || !this.boxDiv?.nativeElement) return;

    const hopKeys   = ['loops_2hop','loops_3hop','loops_4hop','loops_5hop','loops_6hop'];
    const hopLabels = ['2-hop','3-hop','4-hop','5-hop','6-hop'];
    const colors    = ['#4ade80','#86efac','#e8b84b','#fb923c','#f87171'];

    // Expand hop counts into individual data points per org
    const traces = hopKeys.map((key, i) => {
      const vals: number[] = [];
      results.forEach(r => {
        const profile = this.response!.profile_data[String(r['organization'] ?? '')];
        if (profile) {
          const count = Number((profile as any)[key] ?? 0);
          for (let j = 0; j < count; j++) vals.push(i + 2);
        }
      });
      return {
        type:   'box',
        name:   hopLabels[i],
        y:      vals.length ? vals : [i + 2],
        marker: { color: colors[i], size: 4 },
        line:   { color: colors[i] },
        fillcolor: colors[i].replace(')', ', 0.15)').replace('rgb', 'rgba'),
        boxmean: true,
      };
    });

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 40, l: 50, r: 20 },
      yaxis: {
        ...this.plotlyLayout.yaxis,
        title: { text: 'Hop Count', font: { color: '#4b5268', size: 10 } },
      },
    };

    Plotly.newPlot(this.boxDiv.nativeElement, traces, layout, this.plotlyConfig);
  }

  // ── Profile helpers ─────────────────────────────────────────

  private showProfile(orgName: string) {
    const profile = this.response?.profile_data[orgName];
    if (profile) {
      this.selectedProfile = profile;
      this.cdr.detectChanges();
    }
  }

  hopBreakdown(p: OrgProfile) {
    const hops = [
      { label: '2-hop', count: p.loops_2hop, color: '#4ade80' },
      { label: '3-hop', count: p.loops_3hop, color: '#86efac' },
      { label: '4-hop', count: p.loops_4hop, color: '#e8b84b' },
      { label: '5-hop', count: p.loops_5hop, color: '#fb923c' },
      { label: '6-hop', count: p.loops_6hop, color: '#f87171' },
    ];
    const max = Math.max(...hops.map(h => h.count), 1);
    return hops.map(h => ({ ...h, pct: (h.count / max) * 100 }));
  }

  riskClass(score: number) {
    if (score >= 20) return 'risk-high';
    if (score >= 10) return 'risk-med';
    return 'risk-low';
  }

  inflowPct(p: OrgProfile): number {
    if (!p.revenue || p.revenue === 0) return 0;
    return (p.circular_inflow / p.revenue) * 100;
  }

  // ── Formatters ──────────────────────────────────────────────

  formatDollars(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1_000_000_000) return '$' + (n / 1_000_000_000).toFixed(2) + 'B';
    if (n >= 1_000_000)     return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000)         return '$' + (n / 1_000).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  formatCount(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n);
  }

  formatPct(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    return n.toFixed(1) + '%';
  }
}
