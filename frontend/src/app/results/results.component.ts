import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueryResponse } from '../api.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results">

      <!-- Summary -->
      <div class="section">
        <h2>Summary</h2>
        <p>{{ response.summary }}</p>
      </div>

      <!-- Percentage stat (ranking only) -->
      @if (response.percentage_stat) {
        <div class="stat-callout">
          {{ response.percentage_stat }}
        </div>
      }

      <!-- Profile card (profile only) -->
      @if (response.response_type === 'profile' && response.profile) {
        <div class="profile-card">
          <div class="profile-header">
            <h3>{{ response.profile['legal_name'] }}</h3>
            <span class="bn">{{ response.profile['bn'] }}</span>
          </div>

          <div class="profile-grid">

            <div class="profile-section">
              <h4>Financials <span class="year">({{ response.profile['fiscal_year'] }})</span></h4>
              <div class="stat-row">
                <span>Revenue</span>
                <span>{{ formatDollars(response.profile['revenue']) }}</span>
              </div>
              <div class="stat-row">
                <span>Total expenditures</span>
                <span>{{ formatDollars(response.profile['total_expenditures']) }}</span>
              </div>
              <div class="stat-row">
                <span>Program spending</span>
                <span>{{ formatDollars(response.profile['program_spending']) }}</span>
              </div>
              <div class="stat-row">
                <span>Admin spending</span>
                <span>{{ formatDollars(response.profile['admin_spending']) }}</span>
              </div>
              <div class="stat-row highlight">
                <span>Broad overhead %</span>
                <span>{{ formatPct(response.profile['broad_overhead_pct']) }}</span>
              </div>
            </div>

            <div class="profile-section">
              <h4>Circular funding</h4>
              <div class="stat-row">
                <span>Total loops</span>
                <span>{{ response.profile['total_loops'] }}</span>
              </div>
              <div class="stat-row">
                <span>Risk score</span>
                <span class="score" [class.high]="isHighScore(response.profile['score'])">
                  {{ response.profile['score'] }} / 30
                </span>
              </div>
              <div class="stat-row">
                <span>Circular inflow</span>
                <span>{{ formatDollars(response.profile['circular_inflow']) }}</span>
              </div>
              <div class="stat-row">
                <span>Circular outflow</span>
                <span>{{ formatDollars(response.profile['circular_outflow']) }}</span>
              </div>
              <div class="stat-row">
                <span>Inflow as % of revenue</span>
                <span>{{ formatInflowPct(response.profile) }}</span>
              </div>
            </div>

            <div class="profile-section">
              <h4>Loop breakdown</h4>
              <div class="stat-row">
                <span>2-hop (reciprocal)</span>
                <span>{{ response.profile['loops_2hop'] }}</span>
              </div>
              <div class="stat-row">
                <span>3-hop</span>
                <span>{{ response.profile['loops_3hop'] }}</span>
              </div>
              <div class="stat-row">
                <span>4-hop</span>
                <span>{{ response.profile['loops_4hop'] }}</span>
              </div>
              <div class="stat-row">
                <span>5-hop</span>
                <span>{{ response.profile['loops_5hop'] }}</span>
              </div>
              <div class="stat-row">
                <span>6-hop</span>
                <span>{{ response.profile['loops_6hop'] }}</span>
              </div>
            </div>

          </div>
        </div>
      }

      <!-- Generated SQL -->
      <div class="section">
        <h2>Generated SQL</h2>
        <pre>{{ response.sql }}</pre>
      </div>

      <!-- Results table -->
      @if (response.results.length > 0) {
        <div class="section">
          <h2>Results <span class="count">({{ response.results.length }} rows)</span></h2>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  @for (col of columns; track col) {
                    <th>{{ col }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of response.results; track $index) {
                  <tr>
                    @for (col of columns; track col) {
                      <td>{{ row[col] }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (response.results.length === 0) {
        <p class="empty">Query returned no rows.</p>
      }

    </div>
  `,
  styles: [`
    .results { margin-top: 32px; }
    .section { margin-bottom: 28px; }
    h2 {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 8px;
    }
    h3 { font-size: 18px; font-weight: 600; margin: 0 0 4px 0; }
    h4 {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #888;
      margin: 0 0 12px 0;
    }
    .count { font-weight: 400; text-transform: none; letter-spacing: 0; }
    .year { font-weight: 400; text-transform: none; }
    p { font-size: 15px; line-height: 1.6; color: #1a1a1a; }
    pre {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 6px;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .stat-callout {
      background: #f0f7ff;
      border-left: 3px solid #1a73e8;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      font-size: 15px;
      font-weight: 500;
      color: #1a1a1a;
      margin-bottom: 24px;
    }
    .profile-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 28px;
      background: #fafafa;
    }
    .profile-header {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #e0e0e0;
    }
    .bn { font-size: 13px; color: #888; font-family: monospace; }
    .profile-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 24px;
    }
    .profile-section { display: flex; flex-direction: column; }
    .stat-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px solid #f0f0f0;
      font-size: 14px;
    }
    .stat-row span:first-child { color: #555; }
    .stat-row span:last-child { font-weight: 500; color: #1a1a1a; }
    .stat-row.highlight span:last-child { color: #c0392b; }
    .score { font-weight: 600; }
    .score.high { color: #c0392b; }
    .table-wrapper { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th {
      text-align: left;
      padding: 8px 12px;
      background: #f5f5f5;
      border-bottom: 2px solid #ddd;
      white-space: nowrap;
    }
    td { padding: 8px 12px; border-bottom: 1px solid #eee; color: #333; }
    tr:last-child td { border-bottom: none; }
    .empty { color: #888; font-style: italic; }
    @media (max-width: 700px) {
      .profile-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class ResultsComponent {
  @Input({ required: true }) response!: QueryResponse;

  get columns(): string[] {
    if (this.response.results.length === 0) return [];
    return Object.keys(this.response.results[0]);
  }

  formatDollars(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(2) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  formatPct(val: unknown): string {
    const n = Number(val);
    if (isNaN(n)) return '—';
    return n.toFixed(1) + '%';
  }

  formatInflowPct(profile: Record<string, unknown>): string {
    const inflow = Number(profile['circular_inflow']);
    const revenue = Number(profile['revenue']);
    if (isNaN(inflow) || isNaN(revenue) || revenue === 0) return '—';
    return ((inflow / revenue) * 100).toFixed(1) + '%';
  }

  isHighScore(val: unknown): boolean {
    return Number(val) >= 20;
  }
}
