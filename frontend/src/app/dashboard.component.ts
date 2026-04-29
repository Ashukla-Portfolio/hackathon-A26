import {
  Component, OnDestroy, AfterViewInit,
  ChangeDetectorRef, ElementRef, ViewChild, OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService, QueryResponse, OrgProfile, DashboardStats } from './api.service';

declare const Plotly: any;

const DEFAULT_QUESTION = 'Which charities have the highest accountability risk scores?';

const DB_TOTALS = {
  total_orgs:     1501,
  total_loops:    5808,
  total_circular: 260221334,
  avg_score:      6.7
};

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
            <span class="timestamp">Updated {{ lastUpdated }}</span>
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
          placeholder="Ask about circular funding patterns…"
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

      <!-- DB-level stat callouts — always visible, whole database -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ formatCount(DB_TOTALS.total_loops) }}</div>
          <div class="stat-label">Unique Funding Loops</div>
          <div class="stat-sub">across full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatDollars(DB_TOTALS.total_circular) }}</div>
          <div class="stat-label">Total Circular Flow</div>
          <div class="stat-sub">across full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ DB_TOTALS.avg_score }}</div>
          <div class="stat-label">Avg Risk Score</div>
          <div class="stat-sub">across full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatCount(DB_TOTALS.total_orgs) }}</div>
          <div class="stat-label">Organizations in Loops</div>
          <div class="stat-sub">across full dataset</div>
        </div>
      </div>

      @if (response) {

        <!-- Summary + callout strip -->
        <div class="summary-strip">
          <div class="summary-block">
            <span class="summary-text">{{ response.summary }}</span>
          </div>
          @if (response.visual_callout) {
            <div class="visual-callout">
              <span class="callout-icon">⬡</span>
              {{ response.visual_callout }}
            </div>
          }
        </div>

        <!-- Charts grid -->
        <div class="charts-grid">

          <div class="chart-card chart-bar">
            <div class="chart-title">Top Organizations</div>
            <div class="chart-subtitle">Click a bar to view org profile</div>
            <div #barDiv class="chart-div"></div>
          </div>

          <div class="chart-card chart-scatter">
            <div class="chart-title">Risk vs Circular Funding</div>
            <div class="chart-subtitle">Dot size = loop count · Click to view profile</div>
            <div #scatterDiv class="chart-div"></div>
          </div>

          <div class="chart-card chart-box">
            <div class="chart-title">Loop Length Distribution</div>
            <div class="chart-subtitle">Distribution of hop counts across result set</div>
            <div #boxDiv class="chart-div chart-div-short"></div>
          </div>

        </div>

      }

      <!-- Empty / default state -->
      @if (!response && !loading) {
        <div class="empty-state">
          <div class="empty-headline">Explore circular funding in Canadian charities</div>
          <div class="empty-text">
            This dataset covers 1,501 organizations across 5,808 unique funding loops
            representing $260M in circular flow from CRA T3010 filings (2020–2024).
          </div>
          <div class="empty-hints-label">Suggested questions</div>
          <div class="empty-hints">
            <span (click)="setQuestion('Which charities have the highest accountability risk scores?')">
              Highest risk scores
            </span>
            <span (click)="setQuestion('Show me government-funded charities involved in funding loops')">
              Govt-funded orgs in loops
            </span>
            <span (click)="setQuestion('Which charities have the most reciprocal two-hop funding loops?')">
              Reciprocal loops
            </span>
            <span (click)="setQuestion('Which charities have the highest overhead ratios among loop participants?')">
              High overhead in loops
            </span>
          </div>
        </div>
      }

      <!-- Profile card overlay -->
      @if (selectedProfile) {
        <div class="profile-overlay" (click)="clearProfile()">
          <div class="profile-card" (click)="$event.stopPropagation()">
            <button class="profile-close" (click)="clearProfile()">✕</button>
            <div class="profile-name">{{ toTitleCase(selectedProfile.legal_name) }}</div>
            <div class="profile-meta">
              Fiscal Year {{ selectedProfile.fiscal_year }}
              · Risk Score
              <span [class]="riskClass(selectedProfile.score)">
                {{ selectedProfile.score }}/30
              </span>
              @if (selectedProfile.outlier_flag) {
                <span class="outlier-badge">OVERHEAD OUTLIER</span>
              }
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

            <!-- Loop breakdown — click to open Sankey -->
            <div class="loop-breakdown" (click)="openLoopViz()">
              <div class="lb-header">
                <div class="lb-title">Loop Breakdown</div>
                <span class="lb-hint">Click to visualize loops →</span>
              </div>
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

      <!-- Loop viz overlay (Sankey / Chord) -->
      @if (showLoopViz && selectedProfile) {
        <div class="profile-overlay" (click)="closeLoopViz()">
          <div class="loopviz-card" (click)="$event.stopPropagation()">
            <div class="loopviz-header">
              <div>
                <div class="loopviz-title">
                  Funding Loops — {{ toTitleCase(selectedProfile.legal_name) }}
                </div>
                <div class="loopviz-subtitle">
                  Loop {{ currentLoopIdx + 1 }} of {{ loopData.length }}
                  · {{ currentLoop?.hops }}-hop
                  · {{ formatDollars(currentLoop?.total_flow) }} total flow
                </div>
              </div>
              <div class="loopviz-nav">
                <button (click)="prevLoop(); $event.stopPropagation()"
                        [disabled]="currentLoopIdx === 0">←</button>
                <button (click)="nextLoop(); $event.stopPropagation()"
                        [disabled]="currentLoopIdx >= loopData.length - 1">→</button>
                <button class="loopviz-close" (click)="closeLoopViz()">✕</button>
              </div>
            </div>
            <div #sankeyDiv class="sankey-div"></div>
            @if (loopData.length === 0) {
              <div class="loopviz-empty">No loop data available for this organization.</div>
            }
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

    /* Header */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 18px 40px;
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
    .divider { color: #2a2d3a; }
    .subtitle { font-size: 13px; color: #6b7280; }
    .timestamp { font-family: 'DM Mono', monospace; font-size: 11px; color: #3d4257; }

    /* Query bar */
    .query-bar {
      display: flex;
      gap: 12px;
      padding: 20px 40px;
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
      padding: 10px 16px;
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
      min-width: 80px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s;
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
      background: #2d0f0f; color: #f87171;
      padding: 10px 40px; font-size: 13px;
    }

    /* DB-level stats — always visible */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: #1e2130;
      border-bottom: 1px solid #1e2130;
    }
    .stat-card {
      background: #0d0f14;
      padding: 20px 32px;
      text-align: center;
    }
    .stat-value {
      font-family: 'DM Mono', monospace;
      font-size: 26px;
      font-weight: 500;
      color: #e8eaf0;
      line-height: 1;
      margin-bottom: 6px;
    }
    .stat-label {
      font-size: 11px;
      color: #4b5268;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }
    .stat-sub {
      font-size: 10px;
      color: #2a2d3a;
      margin-top: 3px;
      font-family: 'DM Mono', monospace;
    }

    /* Summary strip */
    .summary-strip {
      display: flex;
      align-items: stretch;
      gap: 0;
      border-bottom: 1px solid #1e2130;
    }
    .summary-block {
      flex: 1;
      padding: 14px 40px;
      background: #0f1218;
    }
    .summary-text { font-size: 13px; color: #9ca3af; line-height: 1.6; }
    .visual-callout {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 24px;
      background: #0f1520;
      border-left: 1px solid #1e2130;
      font-size: 12px;
      color: #e8b84b;
      font-family: 'DM Mono', monospace;
      max-width: 340px;
    }
    .callout-icon { font-size: 14px; opacity: 0.6; }

    /* Charts */
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1px;
      background: #1e2130;
      margin-top: 1px;
    }
    .chart-card { background: #0d0f14; padding: 24px 28px; }
    .chart-bar     { grid-column: 1; grid-row: 1; }
    .chart-scatter { grid-column: 2; grid-row: 1; }
    .chart-box     { grid-column: 1 / -1; grid-row: 2; }

    .chart-title {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #4b5268;
      margin-bottom: 2px;
    }
    .chart-subtitle { font-size: 11px; color: #2a2d3a; margin-bottom: 10px; }
    .chart-div { width: 100%; height: 360px; }
    .chart-div-short { height: 220px; }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 60px 40px;
      gap: 14px;
      text-align: center;
    }
    .empty-headline {
      font-size: 18px;
      font-weight: 500;
      color: #e8eaf0;
    }
    .empty-text {
      font-size: 13px;
      color: #4b5268;
      max-width: 520px;
      line-height: 1.6;
    }
    .empty-hints-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #2a2d3a;
      margin-top: 8px;
    }
    .empty-hints {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: center;
    }
    .empty-hints span {
      font-size: 12px;
      color: #4b5268;
      border: 1px solid #1e2130;
      padding: 8px 16px;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: 'DM Mono', monospace;
    }
    .empty-hints span:hover { border-color: #e8b84b; color: #e8b84b; }

    /* Profile overlay */
    .profile-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.75);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }

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
      from { transform: translateY(16px); opacity:0; }
      to   { transform: translateY(0);    opacity:1; }
    }

    .profile-close {
      position: absolute; top: 16px; right: 16px;
      background: none; border: none;
      color: #4b5268; font-size: 16px;
      cursor: pointer; padding: 4px 8px; border-radius: 4px;
    }
    .profile-close:hover { color: #e8eaf0; }

    .profile-name {
      font-size: 18px; font-weight: 600; color: #e8eaf0;
      margin-bottom: 6px; padding-right: 40px; line-height: 1.3;
    }
    .profile-meta {
      font-size: 12px; color: #4b5268;
      margin-bottom: 24px; font-family: 'DM Mono', monospace;
      display: flex; align-items: center; gap: 8px;
    }
    .risk-low  { color: #4ade80; }
    .risk-med  { color: #e8b84b; }
    .risk-high { color: #f87171; }
    .outlier-badge {
      font-size: 9px; letter-spacing: 0.08em;
      background: #2d1515; color: #f87171;
      border: 1px solid #3d2020;
      padding: 2px 6px; border-radius: 3px;
    }

    .profile-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      background: #1e2130;
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .pstat { background: #0d0f14; padding: 14px; text-align: center; }
    .pstat-val {
      font-family: 'DM Mono', monospace;
      font-size: 14px; color: #e8eaf0; margin-bottom: 4px;
    }
    .pstat-lbl {
      font-size: 10px; color: #4b5268;
      text-transform: uppercase; letter-spacing: 0.06em;
    }

    /* Loop breakdown */
    .loop-breakdown {
      background: #0a0c10;
      border: 1px solid #1e2130;
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .loop-breakdown:hover { border-color: #e8b84b; }
    .lb-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .lb-title {
      font-family: 'DM Mono', monospace;
      font-size: 10px; letter-spacing: 0.1em;
      text-transform: uppercase; color: #4b5268;
    }
    .lb-hint { font-size: 11px; color: #2a2d3a; font-family: 'DM Mono', monospace; }
    .loop-breakdown:hover .lb-hint { color: #e8b84b; }
    .lb-bars { display: flex; flex-direction: column; gap: 8px; }
    .lb-row { display: flex; align-items: center; gap: 10px; }
    .lb-label {
      font-family: 'DM Mono', monospace;
      font-size: 11px; color: #6b7280; width: 48px; flex-shrink: 0;
    }
    .lb-bar-wrap {
      flex: 1; height: 6px;
      background: #1e2130; border-radius: 3px; overflow: hidden;
    }
    .lb-bar { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .lb-count {
      font-family: 'DM Mono', monospace;
      font-size: 11px; color: #4b5268; width: 28px; text-align: right;
    }

    /* Loop viz */
    .loopviz-card {
      background: #13161f;
      border: 1px solid #1e2130;
      border-radius: 12px;
      padding: 28px;
      width: 800px;
      max-width: 94vw;
      max-height: 90vh;
      overflow-y: auto;
      animation: slideUp 0.2s ease;
    }
    .loopviz-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 20px;
    }
    .loopviz-title {
      font-size: 15px; font-weight: 600; color: #e8eaf0; margin-bottom: 4px;
    }
    .loopviz-subtitle {
      font-family: 'DM Mono', monospace; font-size: 11px; color: #4b5268;
    }
    .loopviz-nav {
      display: flex; gap: 8px; align-items: center;
    }
    .loopviz-nav button {
      background: #1e2130; border: 1px solid #2a2d3a;
      color: #9ca3af; padding: 6px 12px;
      border-radius: 4px; cursor: pointer; font-size: 13px;
      transition: all 0.15s;
    }
    .loopviz-nav button:hover:not(:disabled) { border-color: #e8b84b; color: #e8b84b; }
    .loopviz-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
    .loopviz-close {
      background: none !important; border: none !important;
      color: #4b5268 !important; font-size: 16px !important;
    }
    .loopviz-close:hover { color: #e8eaf0 !important; }
    .sankey-div { width: 100%; height: 400px; }
    .loopviz-empty { text-align: center; color: #4b5268; padding: 60px; font-size: 13px; }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('barDiv')     barDiv!:     ElementRef<HTMLDivElement>;
  @ViewChild('scatterDiv') scatterDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('boxDiv')     boxDiv!:     ElementRef<HTMLDivElement>;
  @ViewChild('sankeyDiv')  sankeyDiv!:  ElementRef<HTMLDivElement>;

  readonly DB_TOTALS = DB_TOTALS;

  question         = '';
  loading          = false;
  error            = '';
  response:          QueryResponse | null = null;
  selectedProfile:   OrgProfile   | null = null;
  showLoopViz      = false;
  loopData:          any[]        = [];
  currentLoopIdx   = 0;
  lastUpdated      = '';

  private plotlyLayout = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    font:  { family: 'DM Mono, monospace', color: '#6b7280', size: 11 },
    margin: { t: 10, b: 40, l: 10, r: 10 },
    xaxis: { gridcolor: '#1e2130', zerolinecolor: '#1e2130', tickfont: { color: '#4b5268', size: 10 } },
    yaxis: { gridcolor: '#1e2130', zerolinecolor: '#1e2130', tickfont: { color: '#4b5268', size: 10 } },
    showlegend: false,
  };

  private plotlyConfig = { displayModeBar: false, responsive: true };

  get currentLoop() { return this.loopData[this.currentLoopIdx] ?? null; }

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    this.question = DEFAULT_QUESTION;
    this.submit();
  }

  ngAfterViewInit() {}
  ngOnDestroy() { this.purgePlots(); }

  setQuestion(q: string) { this.question = q; this.submit(); }

  submit() {
    if (!this.question.trim() || this.loading) return;
    this.loading  = true;
    this.error    = '';
    this.response = null;
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
        this.error   = err?.error?.detail ?? 'Backend unreachable.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearProfile() {
    this.selectedProfile = null;
    this.showLoopViz = false;
  }

  openLoopViz() {
    if (!this.selectedProfile) return;
    this.loadLoopData(this.selectedProfile.bn);
  }

  closeLoopViz() {
    this.showLoopViz = false;
    this.loopData    = [];
    this.currentLoopIdx = 0;
  }

  prevLoop() { if (this.currentLoopIdx > 0) { this.currentLoopIdx--; this.renderSankey(); } }
  nextLoop() {
    if (this.currentLoopIdx < this.loopData.length - 1) {
      this.currentLoopIdx++;
      this.renderSankey();
    }
  }

  private loadLoopData(bn: string) {
    this.api.getLoops(bn).subscribe({
      next: (data) => {
        this.loopData       = this.groupByLoop(data);
        this.currentLoopIdx = 0;
        this.showLoopViz    = true;
        this.cdr.detectChanges();
        setTimeout(() => this.renderSankey(), 80);
      },
      error: () => {
        this.loopData    = [];
        this.showLoopViz = true;
        this.cdr.detectChanges();
      }
    });
  }

  private groupByLoop(rows: any[]): any[] {
    const map = new Map<number, any>();
    for (const r of rows) {
      if (!map.has(r.loop_id)) {
        map.set(r.loop_id, {
          loop_id:       r.loop_id,
          hops:          r.hops,
          path_display:  r.path_display,
          total_flow:    r.total_flow,
          bottleneck_amt: r.bottleneck_amt,
          min_year:      r.min_year,
          max_year:      r.max_year,
          edges: []
        });
      }
      if (r.src_name && r.dst_name) {
        map.get(r.loop_id).edges.push({
          src: r.src_name, dst: r.dst_name,
          flow: r.total_flow / (r.hops || 1)
        });
      }
    }
    return Array.from(map.values());
  }

  private renderSankey() {
    if (!this.sankeyDiv?.nativeElement || !this.loopData.length) return;
    const loop  = this.currentLoop;
    const edges = loop.edges as { src: string; dst: string; flow: number }[];
    if (!edges.length) return;

    const useChord = loop.hops < 6;

    // Build unique node list
    const nodeSet = new Set<string>();
    edges.forEach(e => { nodeSet.add(e.src); nodeSet.add(e.dst); });
    const nodes  = Array.from(nodeSet);
    const nodeIdx = (n: string) => nodes.indexOf(n);

    const truncate = (s: string) => s.length > 25 ? s.slice(0, 23) + '…' : s;

    try { Plotly.purge(this.sankeyDiv.nativeElement); } catch (_) {}

    const trace: any = {
      type: 'sankey',
      orientation: 'h',
      node: {
        pad: 20, thickness: 20,
        line: { color: '#1e2130', width: 0.5 },
        label: nodes.map(n => truncate(this.toTitleCase(n))),
        color: nodes.map((_, i) =>
          i === 0 ? '#e8b84b' : `hsl(${200 + i * 25}, 60%, 45%)`
        ),
      },
      link: {
        source: edges.map(e => nodeIdx(e.src)),
        target: edges.map(e => nodeIdx(e.dst)),
        value:  edges.map(e => Math.max(e.flow, 1)),
        color:  edges.map(() => 'rgba(232,184,75,0.15)'),
      }
    };

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 10, l: 10, r: 10 },
    };

    Plotly.newPlot(this.sankeyDiv.nativeElement, [trace], layout, this.plotlyConfig);
  }

  // ── Main chart builders ─────────────────────────────────────

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
    const labels    = results.map(r => String(r['organization'] ?? '').slice(0, 35)).reverse();
    const values    = results.map(r => Number(r[metricCol] ?? 0)).reverse();
    const scores    = results.map(r => Number(r['accountability_risk'] ?? 0)).reverse();

    const trace = {
      type: 'bar', orientation: 'h',
      x: values, y: labels,
      marker: { color: scores.map(s => this.riskColor(s)), opacity: 0.85 },
      hovertemplate: '<b>%{y}</b><br>%{x:,.0f}<extra></extra>',
    };

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 40, l: 220, r: 20 },
      yaxis: { ...this.plotlyLayout.yaxis, automargin: true, tickfont: { color: '#9ca3af', size: 10 } },
    };

    Plotly.newPlot(this.barDiv.nativeElement, [trace], layout, this.plotlyConfig)
      .then((el: any) => {
        el.on('plotly_click', (data: any) => {
          const idx     = data.points[0].pointIndex;
          const origIdx = results.length - 1 - idx;
          this.showProfile(String(results[origIdx]['organization'] ?? ''));
        });
      });
  }

  private buildScatter() {
    const results = this.response!.results;
    if (!results.length || !this.scatterDiv?.nativeElement) return;

    const x      = results.map(r => Number(r['circular_amt'] ?? 0));
    const y      = results.map(r => Number(r['accountability_risk'] ?? 0));
    const size   = results.map(r => Math.max(8, Math.min(32, Number(r['funding_loops'] ?? 1) * 0.6)));
    const labels = results.map(r => String(r['organization'] ?? ''));
    const colors = y.map(s => this.riskColor(s));

    const trace = {
      type: 'scatter', mode: 'markers',
      x, y, text: labels,
      marker: { color: colors, size, opacity: 0.8, line: { width: 0 } },
      hovertemplate: '<b>%{text}</b><br>Risk: %{y}<br>Circular $: %{x:$,.0f}<extra></extra>',
    };

    const layout = {
      ...this.plotlyLayout,
      margin: { t: 10, b: 50, l: 60, r: 20 },
      xaxis: {
        ...this.plotlyLayout.xaxis,
        title: { text: 'Circular Flow ($)', font: { color: '#4b5268', size: 10 } },
        tickformat: '$.2s',
      },
      yaxis: {
        ...this.plotlyLayout.yaxis,
        title: { text: 'Risk Score (0–30)', font: { color: '#4b5268', size: 10 } },
        range: [0, 31],
      },
    };

    Plotly.newPlot(this.scatterDiv.nativeElement, [trace], layout, this.plotlyConfig)
      .then((el: any) => {
        el.on('plotly_click', (data: any) => {
          this.showProfile(data.points[0].text as string);
        });
      });
  }

  private buildBox() {
    const profiles = Object.values(this.response!.profile_data ?? {}) as any[];
    if (!profiles.length || !this.boxDiv?.nativeElement) return;

    const hopKeys   = ['loops_2hop','loops_3hop','loops_4hop','loops_5hop','loops_6hop'];
    const hopLabels = ['2-hop','3-hop','4-hop','5-hop','6-hop'];
    const colors    = ['#4ade80','#86efac','#e8b84b','#fb923c','#f87171'];

    const traces = hopKeys.map((key, i) => {
      const vals = profiles.flatMap(p => Array(Number(p[key] ?? 0)).fill(i + 2));
      return {
        type: 'box', name: hopLabels[i],
        y: vals.length ? vals : [i + 2],
        marker: { color: colors[i], size: 4 },
        line: { color: colors[i] },
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

  // ── Helpers ─────────────────────────────────────────────────

  private showProfile(orgName: string) {
    const profile = this.response?.profile_data[orgName];
    if (profile) {
      this.selectedProfile = profile as OrgProfile;
      this.cdr.detectChanges();
    }
  }

   toTitleCase(name: string): string {
    const lower = new Set([
      'a','an','and','at','but','by','for','from',
      'in','nor','of','on','or','the','to','with'
    ]);
    return name.split(' ').map((w, i) => {
      const l = w.toLowerCase();
      return (i === 0 || !lower.has(l))
        ? l.charAt(0).toUpperCase() + l.slice(1)
        : l;
    }).join(' ');
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
