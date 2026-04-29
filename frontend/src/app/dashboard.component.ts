import {
  Component, OnDestroy, AfterViewInit,
  ChangeDetectorRef, ElementRef, ViewChild, OnInit
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService, QueryResponse, OrgProfile } from './api.service';

declare const Plotly: any;

const DEFAULT_QUESTION = 'Which charities have the highest accountability risk scores?';

const DB_TOTALS = {
  total_orgs: 1501, total_loops: 5808,
  total_circular: 260221334, avg_score: 6.7
};

// Hardcoded trend data from DB queries
const SECTOR_TREND = {
  years: [2020, 2021, 2022, 2023, 2024],
  revenue:      [305276, 334287, 342115, 393960, 442199],   // $M
  expenditure:  [290780, 307639, 333637, 576709, 408657],   // $M — 2023 spike notable
};

const LOOP_TREND = {
  years: [2020, 2021, 2022, 2023, 2024],
  circular_millions: [236.3, 244.7, 252.8, 250.6, 252.2],
  orgs_in_loops:     [1412,  1417,  1424,  1428,  1410],
  avg_score:         [6.7,   6.8,   6.8,   6.8,   6.8],
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
          @if (lastUpdated) { <span class="timestamp">Updated {{ lastUpdated }}</span> }
        </div>
      </header>

      <!-- Query bar -->
      <div class="query-bar">
        <textarea class="query-input" [(ngModel)]="question"
          (keydown.meta.enter)="submit()" (keydown.control.enter)="submit()"
          placeholder="Ask about circular funding patterns…" rows="2"></textarea>
        <button class="query-btn" (click)="submit()" [disabled]="loading || !question.trim()">
          @if (loading) { <span class="spinner"></span> } @else { ASK }
        </button>
      </div>

      @if (error) { <div class="error-bar">{{ error }}</div> }

      <!-- DB-level stat callouts — always visible -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ formatCount(DB_TOTALS.total_loops) }}</div>
          <div class="stat-label">Unique Funding Loops</div>
          <div class="stat-sub">full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatDollars(DB_TOTALS.total_circular) }}</div>
          <div class="stat-label">Total Circular Flow</div>
          <div class="stat-sub">full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ DB_TOTALS.avg_score }}</div>
          <div class="stat-label">Avg Risk Score</div>
          <div class="stat-sub">full dataset</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ formatCount(DB_TOTALS.total_orgs) }}</div>
          <div class="stat-label">Orgs in Loops</div>
          <div class="stat-sub">full dataset</div>
        </div>
      </div>

      <!-- Default / overview state — trend charts -->
      @if (!response && !loading) {
        <div class="overview">

          <div class="overview-header">
            <div class="overview-title">Sector Overview — 2020 to 2024</div>
            <div class="overview-hints">
              <span class="hint-label">Suggested questions</span>
              <span class="hint-chip" (click)="setQuestion('Which charities have the highest accountability risk scores?')">
                Highest risk scores
              </span>
              <span class="hint-chip" (click)="setQuestion('Show me government-funded charities involved in funding loops')">
                Govt-funded orgs in loops
              </span>
              <span class="hint-chip" (click)="setQuestion('Which charities have the most reciprocal two-hop funding loops?')">
                Reciprocal loops
              </span>
              <span class="hint-chip" (click)="setQuestion('Which charities have the highest overhead ratios among loop participants?')">
                High overhead in loops
              </span>
            </div>
          </div>

          <div class="trend-grid">

            <div class="chart-card">
              <div class="chart-title">Sector Revenue vs Expenditure ($M)</div>
              <div class="chart-subtitle">
                2023 expenditure anomaly ($576B) may reflect restatements or reclassifications
              </div>
              <div #sectorDiv class="chart-div"></div>
            </div>

            <div class="chart-card">
              <div class="chart-title">Circular Funding Activity by Year</div>
              <div class="chart-subtitle">Organizations in loops and total circular flow</div>
              <div #loopTrendDiv class="chart-div"></div>
            </div>

          </div>

          <div class="overview-note">
            CRA T3010 filings · 2020–2024 · ~84,000 registered Canadian charities ·
            1,501 identified in circular funding patterns
          </div>

        </div>
      }

      <!-- Query results state -->
      @if (response) {

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

        <div class="charts-grid">
          <div class="chart-card chart-bar">
            <div class="chart-title">Top Organizations</div>
            <div class="chart-subtitle">Colour = risk level · Click bar to view profile</div>
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

      <!-- Profile card overlay -->
      @if (selectedProfile) {
        <div class="profile-overlay" (click)="clearProfile()">
          <div class="profile-card" (click)="$event.stopPropagation()">
            <button class="profile-close" (click)="clearProfile()">✕</button>
            <div class="profile-name">{{ toTitleCase(selectedProfile.legal_name) }}</div>
            <div class="profile-meta">
              Fiscal Year {{ selectedProfile.fiscal_year }}
              · Risk Score
              <span [class]="riskClass(selectedProfile.score)">{{ selectedProfile.score }}/30</span>
              @if (selectedProfile.outlier_flag) {
                <span class="outlier-badge">OVERHEAD OUTLIER</span>
              }
            </div>

            <div class="profile-stats">
              <div class="pstat"><div class="pstat-val">{{ formatDollars(selectedProfile.revenue) }}</div><div class="pstat-lbl">Revenue</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatDollars(selectedProfile.total_circular_amt) }}</div><div class="pstat-lbl">Circular $</div></div>
              <div class="pstat"><div class="pstat-val">{{ selectedProfile.total_loops }}</div><div class="pstat-lbl">Total Loops</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatPct(selectedProfile.broad_overhead_pct) }}</div><div class="pstat-lbl">Overhead %</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatDollars(selectedProfile.circular_inflow) }}</div><div class="pstat-lbl">Circ. Inflow</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatPct(inflowPct(selectedProfile)) }}</div><div class="pstat-lbl">Inflow / Revenue</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatDollars(selectedProfile.program_spending) }}</div><div class="pstat-lbl">Program Spend</div></div>
              <div class="pstat"><div class="pstat-val">{{ formatDollars(selectedProfile.admin_spending) }}</div><div class="pstat-lbl">Admin Spend</div></div>
            </div>

            <div class="loop-breakdown">
              <div class="lb-header">
                <div class="lb-title">Loop Breakdown</div>
                <span class="lb-hint">Click a row to visualize that hop group →</span>
              </div>
              <div class="lb-bars">
                @for (hop of hopBreakdown(selectedProfile); track hop.label) {
                  <div class="lb-row lb-row-clickable"
                       [class.lb-row-disabled]="hop.count === 0"
                       (click)="hop.count > 0 && openLoopViz(hop.hops)">
                    <span class="lb-label">{{ hop.label }}</span>
                    <div class="lb-bar-wrap">
                      <div class="lb-bar" [style.width]="hop.pct + '%'" [style.background]="hop.color"></div>
                    </div>
                    <span class="lb-count">{{ hop.count }}</span>
                    @if (hop.count > 0) {
                      <span class="lb-arrow">→</span>
                    }
                  </div>
                }
              </div>
            </div>

          </div>
        </div>
      }

      <!-- Sankey overlay -->
      @if (showLoopViz && selectedProfile) {
        <div class="profile-overlay" (click)="closeLoopViz()">
          <div class="loopviz-card" (click)="$event.stopPropagation()">
            <div class="loopviz-header">
              <div>
                <div class="loopviz-title">
                  {{ toTitleCase(selectedProfile.legal_name) }}
                  — {{ activeHopFilter }}-hop loops
                  ({{ currentLoopIdx + 1 }} of {{ currentHopGroup.length }})
                </div>
                @if (currentLoopGroup) {
                  <div class="loopviz-subtitle">
                    {{ formatDollars(currentLoopGroup.total_flow) }} total flow
                    · {{ currentLoopGroup.min_year }}–{{ currentLoopGroup.max_year }}
                  </div>
                  <div class="loopviz-path">{{ currentLoopGroup.path_display }}</div>
                }
              </div>
              <div class="loopviz-nav">
                <button (click)="prevLoop(); $event.stopPropagation()"
                        [disabled]="currentLoopIdx === 0">←</button>
                <button (click)="nextLoop(); $event.stopPropagation()"
                        [disabled]="atGroupEnd">→</button>
                <button class="loopviz-close" (click)="closeLoopViz()">✕</button>
              </div>
            </div>

            <!-- End of group verification -->
            @if (showGroupEnd) {
              <div class="group-end">
                <div class="group-end-msg">
                  You've reviewed all {{ currentHopGroup.length }}
                  {{ activeHopFilter }}-hop loops.
                  @if (nextHopFilter) {
                    Continue to {{ nextHopFilter }}-hop loops?
                  } @else {
                    You've reached the end of all loop groups.
                  }
                </div>
                <div class="group-end-actions">
                  @if (nextHopFilter) {
                    <button class="gea-yes" (click)="advanceHopGroup(); $event.stopPropagation()">
                      Yes, show {{ nextHopFilter }}-hop loops
                    </button>
                    <button class="gea-skip" (click)="closeLoopViz(); $event.stopPropagation()">
                      Skip — close
                    </button>
                  } @else {
                    <button class="gea-skip" (click)="closeLoopViz(); $event.stopPropagation()">
                      Close
                    </button>
                  }
                </div>
              </div>
            }

            <div #sankeyDiv class="sankey-div"></div>
            @if (currentHopGroup.length === 0) {
              <div class="loopviz-empty">No loop data available for this hop group.</div>
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

    .shell { min-height: 100vh; background: #0d0f14; color: #e8eaf0; font-family: 'DM Sans', sans-serif; }

    .header { display: flex; justify-content: space-between; align-items: center; padding: 18px 40px; border-bottom: 1px solid #1e2130; background: #0a0c10; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .wordmark { font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 500; letter-spacing: 0.15em; color: #e8b84b; }
    .divider { color: #2a2d3a; }
    .subtitle { font-size: 13px; color: #6b7280; }
    .timestamp { font-family: 'DM Mono', monospace; font-size: 11px; color: #3d4257; }

    .query-bar { display: flex; gap: 12px; padding: 20px 40px; background: #0a0c10; border-bottom: 1px solid #1e2130; }
    .query-input { flex: 1; background: #13161f; border: 1px solid #1e2130; border-radius: 6px; color: #e8eaf0; font-family: 'DM Sans', sans-serif; font-size: 14px; padding: 10px 16px; resize: none; line-height: 1.5; transition: border-color 0.2s; }
    .query-input:focus { outline: none; border-color: #e8b84b; }
    .query-input::placeholder { color: #3d4257; }
    .query-btn { padding: 0 28px; background: #e8b84b; color: #0a0c10; border: none; border-radius: 6px; font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; letter-spacing: 0.1em; cursor: pointer; min-width: 80px; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }
    .query-btn:hover:not(:disabled) { background: #f0c95a; }
    .query-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .spinner { width: 14px; height: 14px; border: 2px solid #0a0c10; border-top-color: transparent; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .error-bar { background: #2d0f0f; color: #f87171; padding: 10px 40px; font-size: 13px; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1e2130; border-bottom: 1px solid #1e2130; }
    .stat-card { background: #0d0f14; padding: 20px 32px; text-align: center; }
    .stat-value { font-family: 'DM Mono', monospace; font-size: 26px; font-weight: 500; color: #e8eaf0; line-height: 1; margin-bottom: 6px; }
    .stat-label { font-size: 11px; color: #4b5268; letter-spacing: 0.07em; text-transform: uppercase; }
    .stat-sub { font-size: 10px; color: #2a2d3a; margin-top: 3px; font-family: 'DM Mono', monospace; }

    /* Overview */
    .overview { padding: 32px 40px; }
    .overview-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; gap: 24px; flex-wrap: wrap; }
    .overview-title { font-family: 'DM Mono', monospace; font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #4b5268; padding-top: 4px; }
    .overview-hints { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .hint-label { font-family: 'DM Mono', monospace; font-size: 10px; color: #2a2d3a; letter-spacing: 0.08em; text-transform: uppercase; white-space: nowrap; }
    .hint-chip { font-size: 12px; color: #4b5268; border: 1px solid #1e2130; padding: 6px 14px; border-radius: 20px; cursor: pointer; transition: all 0.15s; font-family: 'DM Mono', monospace; white-space: nowrap; }
    .hint-chip:hover { border-color: #e8b84b; color: #e8b84b; }
    .trend-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #1e2130; border-radius: 8px; overflow: hidden; }
    .overview-note { font-size: 11px; color: #2a2d3a; font-family: 'DM Mono', monospace; margin-top: 16px; text-align: center; }

    /* Summary strip */
    .summary-strip { display: flex; align-items: stretch; border-bottom: 1px solid #1e2130; }
    .summary-block { flex: 1; padding: 14px 40px; background: #0f1218; }
    .summary-text { font-size: 13px; color: #9ca3af; line-height: 1.6; }
    .visual-callout { display: flex; align-items: center; gap: 8px; padding: 14px 24px; background: #0f1520; border-left: 1px solid #1e2130; font-size: 12px; color: #e8b84b; font-family: 'DM Mono', monospace; max-width: 360px; }
    .callout-icon { font-size: 14px; opacity: 0.6; }

    /* Charts */
    .charts-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #1e2130; margin-top: 1px; }
    .chart-card { background: #0d0f14; padding: 24px 28px; }
    .chart-bar { grid-column: 1; grid-row: 1; }
    .chart-scatter { grid-column: 2; grid-row: 1; }
    .chart-box { grid-column: 1 / -1; grid-row: 2; }
    .chart-title { font-family: 'DM Mono', monospace; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: #4b5268; margin-bottom: 2px; }
    .chart-subtitle { font-size: 11px; color: #2a2d3a; margin-bottom: 10px; }
    .chart-div { width: 100%; height: 360px; }
    .chart-div-short { height: 220px; }

    /* Profile overlay */
    .profile-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.75); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.15s ease; }
    @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
    .profile-card { background: #13161f; border: 1px solid #1e2130; border-radius: 12px; padding: 32px; width: 640px; max-width: 90vw; max-height: 85vh; overflow-y: auto; position: relative; animation: slideUp 0.2s ease; }
    @keyframes slideUp { from { transform: translateY(16px); opacity:0; } to { transform: translateY(0); opacity:1; } }
    .profile-close { position: absolute; top: 16px; right: 16px; background: none; border: none; color: #4b5268; font-size: 16px; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .profile-close:hover { color: #e8eaf0; }
    .profile-name { font-size: 18px; font-weight: 600; color: #e8eaf0; margin-bottom: 6px; padding-right: 40px; line-height: 1.3; }
    .profile-meta { font-size: 12px; color: #4b5268; margin-bottom: 24px; font-family: 'DM Mono', monospace; display: flex; align-items: center; gap: 8px; }
    .risk-low { color: #4ade80; } .risk-med { color: #e8b84b; } .risk-high { color: #f87171; }
    .outlier-badge { font-size: 9px; letter-spacing: 0.08em; background: #2d1515; color: #f87171; border: 1px solid #3d2020; padding: 2px 6px; border-radius: 3px; }
    .profile-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #1e2130; border-radius: 8px; overflow: hidden; margin-bottom: 20px; }
    .pstat { background: #0d0f14; padding: 14px; text-align: center; }
    .pstat-val { font-family: 'DM Mono', monospace; font-size: 14px; color: #e8eaf0; margin-bottom: 4px; }
    .pstat-lbl { font-size: 10px; color: #4b5268; text-transform: uppercase; letter-spacing: 0.06em; }

    /* Loop breakdown */
    .loop-breakdown { background: #0a0c10; border: 1px solid #1e2130; border-radius: 8px; padding: 16px; cursor: pointer; transition: border-color 0.15s; }
    .loop-breakdown:hover { border-color: #e8b84b; }
    .lb-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .lb-title { font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: #4b5268; }
    .lb-hint { font-size: 11px; color: #2a2d3a; font-family: 'DM Mono', monospace; }
    .loop-breakdown:hover .lb-hint { color: #e8b84b; }
    .lb-bars { display: flex; flex-direction: column; gap: 8px; }
    .lb-row { display: flex; align-items: center; gap: 10px; }
    .lb-label { font-family: 'DM Mono', monospace; font-size: 11px; color: #6b7280; width: 48px; flex-shrink: 0; }
    .lb-bar-wrap { flex: 1; height: 6px; background: #1e2130; border-radius: 3px; overflow: hidden; }
    .lb-bar { height: 100%; border-radius: 3px; transition: width 0.4s ease; }
    .lb-count { font-family: 'DM Mono', monospace; font-size: 11px; color: #4b5268; width: 28px; text-align: right; }

    /* Sankey */
    .loopviz-card { background: #13161f; border: 1px solid #1e2130; border-radius: 12px; padding: 28px; width: 75vw; max-width: 75vw; height: 75vh; max-height: 75vh; display: flex; flex-direction: column; animation: slideUp 0.2s ease; overflow: hidden; }
    .loopviz-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-shrink: 0; }
    .loopviz-title { font-size: 15px; font-weight: 600; color: #e8eaf0; margin-bottom: 4px; }
    .loopviz-subtitle { font-family: 'DM Mono', monospace; font-size: 11px; color: #4b5268; margin-bottom: 4px; }
    .loopviz-path { font-family: 'DM Mono', monospace; font-size: 11px; color: #3d4257; }
    .loopviz-nav { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
    .loopviz-nav button { background: #1e2130; border: 1px solid #2a2d3a; color: #9ca3af; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.15s; }
    .loopviz-nav button:hover:not(:disabled) { border-color: #e8b84b; color: #e8b84b; }
    .loopviz-nav button:disabled { opacity: 0.3; cursor: not-allowed; }
    .loopviz-close { background: none !important; border: none !important; color: #4b5268 !important; font-size: 16px !important; }
    .loopviz-close:hover { color: #e8eaf0 !important; }
    .sankey-div { width: 100%; flex: 1; min-height: 0; }
    .loopviz-empty { text-align: center; color: #4b5268; padding: 60px; font-size: 13px; }
    /* Group end prompt */
    .group-end { background: #0f1520; border: 1px solid #2a3050; border-radius: 8px; padding: 20px 24px; margin-bottom: 16px; flex-shrink: 0; }
    .group-end-msg { font-size: 13px; color: #9ca3af; margin-bottom: 14px; line-height: 1.5; }
    .group-end-actions { display: flex; gap: 10px; }
    .gea-yes { background: #e8b84b; color: #0a0c10; border: none; border-radius: 6px; padding: 8px 20px; font-family: 'DM Mono', monospace; font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    .gea-yes:hover { background: #f0c95a; }
    .gea-skip { background: none; color: #4b5268; border: 1px solid #2a2d3a; border-radius: 6px; padding: 8px 20px; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; transition: all 0.15s; }
    .gea-skip:hover { border-color: #4b5268; color: #9ca3af; }
    /* Hop row clickable */
    .lb-row-clickable { cursor: pointer; padding: 4px 6px; margin: -4px -6px; border-radius: 4px; transition: background 0.12s; }
    .lb-row-clickable:hover { background: #13161f; }
    .lb-row-disabled { cursor: default; opacity: 0.35; }
    .lb-arrow { font-size: 11px; color: #e8b84b; opacity: 0; transition: opacity 0.12s; margin-left: 4px; }
    .lb-row-clickable:hover .lb-arrow { opacity: 1; }
  `]
})
export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('barDiv')       barDiv!:       ElementRef<HTMLDivElement>;
  @ViewChild('scatterDiv')   scatterDiv!:   ElementRef<HTMLDivElement>;
  @ViewChild('boxDiv')       boxDiv!:       ElementRef<HTMLDivElement>;
  @ViewChild('sectorDiv')    sectorDiv!:    ElementRef<HTMLDivElement>;
  @ViewChild('loopTrendDiv') loopTrendDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('sankeyDiv')    sankeyDiv!:    ElementRef<HTMLDivElement>;

  readonly DB_TOTALS = DB_TOTALS;

  question        = '';
  loading         = false;
  error           = '';
  response:         QueryResponse | null = null;
  selectedProfile:  OrgProfile   | null = null;
  showLoopViz     = false;
  allLoopGroups:    Record<number, any[]> = {};  // keyed by hop count
  loopGroups:       any[]        = [];           // legacy — kept for renderSankey
  activeHopFilter = 2;
  currentLoopIdx  = 0;
  showGroupEnd    = false;
  lastUpdated     = '';

  get currentHopGroup(): any[] {
    return this.allLoopGroups[this.activeHopFilter] ?? [];
  }
  get atGroupEnd(): boolean {
    return this.currentLoopIdx >= this.currentHopGroup.length - 1;
  }
  get nextHopFilter(): number | null {
    const available = Object.keys(this.allLoopGroups).map(Number).sort((a,b) => a-b);
    const idx = available.indexOf(this.activeHopFilter);
    return idx >= 0 && idx < available.length - 1 ? available[idx + 1] : null;
  }

  private plotlyBase = {
    paper_bgcolor: 'transparent',
    plot_bgcolor:  'transparent',
    font:   { family: 'DM Mono, monospace', color: '#6b7280', size: 11 },
    xaxis:  { gridcolor: '#1e2130', zerolinecolor: '#1e2130', tickfont: { color: '#4b5268', size: 10 } },
    yaxis:  { gridcolor: '#1e2130', zerolinecolor: '#1e2130', tickfont: { color: '#4b5268', size: 10 } },
    showlegend: false,
  };

  private cfg = { displayModeBar: false, responsive: true };

  get currentLoopGroup() { return this.loopGroups[this.currentLoopIdx] ?? null; }

  constructor(private api: ApiService, private cdr: ChangeDetectorRef) {}

  ngOnInit() {
    // Build trend charts on load
    setTimeout(() => this.buildTrendCharts(), 100);
  }

  ngAfterViewInit() {}

  ngOnDestroy() { this.purgeAll(); }

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
        setTimeout(() => this.buildQueryCharts(), 80);
      },
      error: (err) => {
        this.error   = err?.error?.detail ?? 'Backend unreachable.';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  clearProfile() { this.selectedProfile = null; this.showLoopViz = false; }

  openLoopViz(hopFilter: number = 2) {
    if (!this.selectedProfile?.bn) return;
    if (Object.keys(this.allLoopGroups).length > 0) {
      // Data already loaded — just switch filter
      this.activeHopFilter = hopFilter;
      this.currentLoopIdx  = 0;
      this.showGroupEnd    = false;
      this.loopGroups      = this.currentHopGroup;
      this.showLoopViz     = true;
      this.cdr.detectChanges();
      setTimeout(() => this.renderSankey(), 80);
      return;
    }
    this.api.getLoops(this.selectedProfile.bn).subscribe({
      next: (rows) => {
        const grouped = this.groupLoops(rows);
        // Organise into hop buckets
        this.allLoopGroups = {};
        for (const g of grouped) {
          const h = g.hops as number;
          if (!this.allLoopGroups[h]) this.allLoopGroups[h] = [];
          this.allLoopGroups[h].push(g);
        }
        // Sort each bucket by total_flow DESC
        for (const h of Object.keys(this.allLoopGroups)) {
          this.allLoopGroups[+h].sort((a: any, b: any) => b.total_flow - a.total_flow);
        }
        this.activeHopFilter = hopFilter;
        this.currentLoopIdx  = 0;
        this.showGroupEnd    = false;
        this.loopGroups      = this.currentHopGroup;
        this.showLoopViz     = true;
        this.cdr.detectChanges();
        setTimeout(() => this.renderSankey(), 80);
      },
      error: () => {
        this.allLoopGroups = {};
        this.showLoopViz   = true;
        this.cdr.detectChanges();
      }
    });
  }

  closeLoopViz() {
    this.showLoopViz    = false;
    this.allLoopGroups  = {};
    this.loopGroups     = [];
    this.currentLoopIdx = 0;
    this.showGroupEnd   = false;
  }

  advanceHopGroup() {
    const next = this.nextHopFilter;
    if (next === null) return;
    this.activeHopFilter = next;
    this.currentLoopIdx  = 0;
    this.showGroupEnd    = false;
    this.loopGroups      = this.currentHopGroup;
    this.cdr.detectChanges();
    setTimeout(() => this.renderSankey(), 80);
  }

  prevLoop() {
    if (this.currentLoopIdx > 0) {
      this.currentLoopIdx--;
      this.showGroupEnd = false;
      this.loopGroups   = this.currentHopGroup;
      this.cdr.detectChanges();
      setTimeout(() => this.renderSankey(), 50);
    }
  }

  nextLoop() {
    if (this.atGroupEnd) {
      this.showGroupEnd = true;
      this.cdr.detectChanges();
      return;
    }
    this.currentLoopIdx++;
    this.showGroupEnd = false;
    this.loopGroups   = this.currentHopGroup;
    this.cdr.detectChanges();
    setTimeout(() => this.renderSankey(), 50);
  }

  // ── Loop data grouping ──────────────────────────────────────

  private groupLoops(rows: any[]): any[] {
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
          hops_ordered:  []
        });
      }
      map.get(r.loop_id).hops_ordered.push({
        position: r.position_in_loop,
        src_name: r.src_name ?? r.src_bn,
        dst_name: r.dst_name ?? r.dst_bn,
        hop_flow: Number(r.hop_flow ?? 0)
      });
    }
    // Sort hops by position within each loop
    for (const loop of map.values()) {
      loop.hops_ordered.sort((a: any, b: any) => a.position - b.position);
    }
    return Array.from(map.values());
  }

  // ── Sankey renderer ─────────────────────────────────────────

  private renderSankey() {
    const group = this.currentHopGroup;
    if (!this.sankeyDiv?.nativeElement || !group.length) return;
    const loop = group[this.currentLoopIdx];
    if (!loop) return;

    try { Plotly.purge(this.sankeyDiv.nativeElement); } catch (_) {}

    const hops: { src_name: string; dst_name: string; hop_flow: number }[] = loop.hops_ordered;
    if (!hops.length) return;

    // Build ordered node list preserving path sequence
    const nodeList: string[] = [];
    const seen = new Set<string>();
    for (const h of hops) {
      if (!seen.has(h.src_name)) { nodeList.push(h.src_name); seen.add(h.src_name); }
      if (!seen.has(h.dst_name)) { nodeList.push(h.dst_name); seen.add(h.dst_name); }
    }

    const nodeIdx = (n: string) => nodeList.indexOf(n);
    const truncate = (s: string) => this.toTitleCase(s.length > 28 ? s.slice(0, 26) + '…' : s);

    // Colour: selected org = amber, others = blue spectrum
    const selectedName = this.selectedProfile?.legal_name?.toUpperCase() ?? '';
    const nodeColors = nodeList.map(n =>
      n.toUpperCase() === selectedName ? '#e8b84b' :
      `hsl(${210 + nodeList.indexOf(n) * 30}, 55%, 45%)`
    );

    const trace = {
      type: 'sankey',
      orientation: 'h',
      arrangement: 'snap',
      node: {
        pad: 24,
        thickness: 18,
        line: { color: '#1e2130', width: 0.5 },
        label: nodeList.map(truncate),
        color: nodeColors,
        hovertemplate: '<b>%{label}</b><extra></extra>',
      },
      link: {
        source: hops.map(h => nodeIdx(h.src_name)),
        target: hops.map(h => nodeIdx(h.dst_name)),
        value:  hops.map(h => Math.max(h.hop_flow, 1)),
        color:  hops.map(() => 'rgba(232,184,75,0.12)'),
        hovertemplate: '%{source.label} → %{target.label}<br>$%{value:,.0f}<extra></extra>',
      }
    };

    const layout = {
      ...this.plotlyBase,
      margin: { t: 10, b: 10, l: 10, r: 10 },
    };

    Plotly.newPlot(this.sankeyDiv.nativeElement, [trace], layout, this.cfg);
  }

  // ── Trend charts (default view) ─────────────────────────────

  private buildTrendCharts() {
    this.buildSectorTrend();
    this.buildLoopTrend();
  }

  private buildSectorTrend() {
    if (!this.sectorDiv?.nativeElement) return;
    const traces = [
      {
        type: 'scatter', mode: 'lines+markers',
        name: 'Revenue',
        x: SECTOR_TREND.years, y: SECTOR_TREND.revenue,
        line: { color: '#4ade80', width: 2 },
        marker: { color: '#4ade80', size: 6 },
        hovertemplate: '%{x}: $%{y:,.0f}M<extra>Revenue</extra>',
      },
      {
        type: 'scatter', mode: 'lines+markers',
        name: 'Expenditure',
        x: SECTOR_TREND.years, y: SECTOR_TREND.expenditure,
        line: { color: '#f87171', width: 2, dash: 'dot' },
        marker: { color: '#f87171', size: 6 },
        hovertemplate: '%{x}: $%{y:,.0f}M<extra>Expenditure</extra>',
      }
    ];

    const layout = {
      ...this.plotlyBase,
      showlegend: true,
      legend: { font: { color: '#6b7280', size: 10 }, bgcolor: 'transparent' },
      margin: { t: 10, b: 40, l: 70, r: 20 },
      yaxis: {
        ...this.plotlyBase.yaxis,
        title: { text: '$M', font: { color: '#4b5268', size: 10 } },
        tickformat: ',.0f',
      },
      xaxis: { ...this.plotlyBase.xaxis, dtick: 1 },
    };

    Plotly.newPlot(this.sectorDiv.nativeElement, traces, layout, this.cfg);
  }

  private buildLoopTrend() {
    if (!this.loopTrendDiv?.nativeElement) return;
    const traces = [
      {
        type: 'scatter', mode: 'lines+markers',
        name: 'Circular $M',
        x: LOOP_TREND.years, y: LOOP_TREND.circular_millions,
        line: { color: '#e8b84b', width: 2 },
        marker: { color: '#e8b84b', size: 6 },
        hovertemplate: '%{x}: $%{y:.1f}M<extra>Circular Flow</extra>',
        yaxis: 'y',
      },
      {
        type: 'bar',
        name: 'Orgs in Loops',
        x: LOOP_TREND.years, y: LOOP_TREND.orgs_in_loops,
        marker: { color: 'rgba(74,222,128,0.25)', line: { color: '#4ade80', width: 1 } },
        hovertemplate: '%{x}: %{y} orgs<extra>Orgs in Loops</extra>',
        yaxis: 'y2',
      }
    ];

    const layout = {
      ...this.plotlyBase,
      showlegend: true,
      legend: { font: { color: '#6b7280', size: 10 }, bgcolor: 'transparent' },
      margin: { t: 10, b: 40, l: 60, r: 60 },
      barmode: 'overlay',
      xaxis: { ...this.plotlyBase.xaxis, dtick: 1 },
      yaxis: {
        ...this.plotlyBase.yaxis,
        title: { text: 'Circular $M', font: { color: '#4b5268', size: 10 } },
      },
      yaxis2: {
        gridcolor: 'transparent', zerolinecolor: '#1e2130',
        tickfont: { color: '#4b5268', size: 10 },
        title: { text: 'Orgs', font: { color: '#4b5268', size: 10 } },
        overlaying: 'y', side: 'right',
      },
    };

    Plotly.newPlot(this.loopTrendDiv.nativeElement, traces, layout, this.cfg);
  }

  // ── Query result charts ─────────────────────────────────────

  private purgeAll() {
    try {
      [this.barDiv, this.scatterDiv, this.boxDiv, this.sectorDiv, this.loopTrendDiv]
        .forEach(ref => { if (ref?.nativeElement) Plotly.purge(ref.nativeElement); });
    } catch (_) {}
  }

  private buildQueryCharts() {
    if (!this.response) return;
    try {
      if (this.barDiv?.nativeElement)     Plotly.purge(this.barDiv.nativeElement);
      if (this.scatterDiv?.nativeElement) Plotly.purge(this.scatterDiv.nativeElement);
      if (this.boxDiv?.nativeElement)     Plotly.purge(this.boxDiv.nativeElement);
    } catch (_) {}
    this.buildBar();
    this.buildScatter();
    this.buildBox();
  }

  private riskColor(score: number) {
    if (score >= 20) return '#f87171';
    if (score >= 10) return '#e8b84b';
    return '#4ade80';
  }

  private buildBar() {
    const results = this.response!.results;
    if (!results.length || !this.barDiv?.nativeElement) return;

    const cols      = Object.keys(results[0]);
    const metricCol = cols[1] ?? cols[0];
    const labels    = results.map(r => String(r['organization'] ?? '').slice(0, 35)).reverse();
    const values    = results.map(r => Number(r[metricCol] ?? 0)).reverse();
    const scores    = results.map(r => Number(r['accountability_risk'] ?? 0)).reverse();

    Plotly.newPlot(this.barDiv.nativeElement, [{
      type: 'bar', orientation: 'h',
      x: values, y: labels,
      marker: { color: scores.map(s => this.riskColor(s)), opacity: 0.85 },
      hovertemplate: '<b>%{y}</b><br>%{x:,.0f}<extra></extra>',
    }], {
      ...this.plotlyBase,
      margin: { t: 10, b: 40, l: 220, r: 20 },
      yaxis: { ...this.plotlyBase.yaxis, automargin: true, tickfont: { color: '#9ca3af', size: 10 } },
    }, this.cfg).then((el: any) => {
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

    Plotly.newPlot(this.scatterDiv.nativeElement, [{
      type: 'scatter', mode: 'markers',
      x:    results.map(r => Number(r['circular_amt'] ?? 0)),
      y:    results.map(r => Number(r['accountability_risk'] ?? 0)),
      text: results.map(r => String(r['organization'] ?? '')),
      marker: {
        color: results.map(r => this.riskColor(Number(r['accountability_risk'] ?? 0))),
        size:  results.map(r => Math.max(8, Math.min(32, Number(r['funding_loops'] ?? 1) * 0.6))),
        opacity: 0.8, line: { width: 0 }
      },
      hovertemplate: '<b>%{text}</b><br>Risk: %{y}<br>Circular $: %{x:$,.0f}<extra></extra>',
    }], {
      ...this.plotlyBase,
      margin: { t: 10, b: 50, l: 60, r: 20 },
      xaxis: { ...this.plotlyBase.xaxis, title: { text: 'Circular Flow ($)', font: { color: '#4b5268', size: 10 } }, tickformat: '$.2s' },
      yaxis: { ...this.plotlyBase.yaxis, title: { text: 'Risk Score (0–30)', font: { color: '#4b5268', size: 10 } }, range: [0, 31] },
    }, this.cfg).then((el: any) => {
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

    const traces = hopKeys.map((key, i) => ({
      type: 'box', name: hopLabels[i],
      y: profiles.flatMap(p => Array(Number(p[key] ?? 0)).fill(i + 2)).length
         ? profiles.flatMap(p => Array(Number(p[key] ?? 0)).fill(i + 2))
         : [i + 2],
      marker: { color: colors[i], size: 4 },
      line: { color: colors[i] },
      boxmean: true,
    }));

    Plotly.newPlot(this.boxDiv.nativeElement, traces, {
      ...this.plotlyBase,
      margin: { t: 10, b: 40, l: 50, r: 20 },
      yaxis: { ...this.plotlyBase.yaxis, title: { text: 'Hop Count', font: { color: '#4b5268', size: 10 } } },
    }, this.cfg);
  }

  // ── Helpers ─────────────────────────────────────────────────

  private showProfile(orgName: string) {
    const profile = this.response?.profile_data[orgName];
    if (profile) { this.selectedProfile = profile as OrgProfile; this.cdr.detectChanges(); }
  }

  toTitleCase(name: string): string {
    if (!name) return name;
    const lower = new Set(['a','an','and','at','but','by','for','from','in','nor','of','on','or','the','to','with']);
    return name.split(' ').map((w, i) => {
      const l = w.toLowerCase();
      return (i === 0 || !lower.has(l)) ? l.charAt(0).toUpperCase() + l.slice(1) : l;
    }).join(' ');
  }

  hopBreakdown(p: OrgProfile) {
    const hops = [
      { label: '2-hop', hops: 2, count: p.loops_2hop, color: '#4ade80' },
      { label: '3-hop', hops: 3, count: p.loops_3hop, color: '#86efac' },
      { label: '4-hop', hops: 4, count: p.loops_4hop, color: '#e8b84b' },
      { label: '5-hop', hops: 5, count: p.loops_5hop, color: '#fb923c' },
      { label: '6-hop', hops: 6, count: p.loops_6hop, color: '#f87171' },
    ];
    const max = Math.max(...hops.map(h => h.count), 1);
    return hops.map(h => ({ ...h, pct: (h.count / max) * 100 }));
  }

  riskClass(score: number) { return score >= 20 ? 'risk-high' : score >= 10 ? 'risk-med' : 'risk-low'; }
  inflowPct(p: OrgProfile) { return !p.revenue ? 0 : (p.circular_inflow / p.revenue) * 100; }

  formatDollars(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1e9) return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n/1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n/1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  formatCount(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1e6) return (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n/1e3).toFixed(1) + 'K';
    return String(n);
  }

  formatPct(val: unknown): string {
    const n = Number(val);
    return isNaN(n) ? '—' : n.toFixed(1) + '%';
  }
}
