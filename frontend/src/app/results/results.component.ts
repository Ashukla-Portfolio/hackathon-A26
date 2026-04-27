import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueryResponse } from '../api.service';

@Component({
  selector: 'app-results',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="results">

      <div class="section">
        <h2>Summary</h2>
        <p>{{ response.summary }}</p>
      </div>

      <div class="section">
        <h2>Generated SQL</h2>
        <pre>{{ response.sql }}</pre>
      </div>

      <div class="section" *ngIf="response.results.length > 0">
        <h2>Results <span class="count">({{ response.results.length }} rows)</span></h2>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th *ngFor="let col of columns">{{ col }}</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let row of response.results">
                <td *ngFor="let col of columns">{{ row[col] }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="empty" *ngIf="response.results.length === 0">
        Query returned no rows.
      </p>

    </div>
  `,
  styles: [`
    .results {
      margin-top: 32px;
    }
    .section {
      margin-bottom: 28px;
    }
    h2 {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #888;
      margin-bottom: 8px;
    }
    .count {
      font-weight: 400;
      text-transform: none;
      letter-spacing: 0;
    }
    p {
      font-size: 15px;
      line-height: 1.6;
      color: #1a1a1a;
    }
    pre {
      background: #f5f5f5;
      padding: 16px;
      border-radius: 6px;
      font-size: 13px;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .table-wrapper {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    th {
      text-align: left;
      padding: 8px 12px;
      background: #f5f5f5;
      border-bottom: 2px solid #ddd;
      white-space: nowrap;
    }
    td {
      padding: 8px 12px;
      border-bottom: 1px solid #eee;
      color: #333;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .empty {
      color: #888;
      font-style: italic;
    }
  `]
})
export class ResultsComponent {
  @Input({ required: true }) response!: QueryResponse;

  get columns(): string[] {
    if (this.response.results.length === 0) return [];
    return Object.keys(this.response.results[0]);
  }
}
