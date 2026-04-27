import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ApiService, QueryResponse } from '../api.service';
import { ResultsComponent } from '../results/results.component';

@Component({
  selector: 'app-query',
  standalone: true,
  imports: [FormsModule, CommonModule, ResultsComponent],
  template: `
    <div class="container">
      <h1>Funding Loop Explorer</h1>
      <p class="subtitle">Ask a question about circular funding patterns in CRA charity data.</p>

      <div class="input-row">
        <textarea
          [(ngModel)]="question"
          (keydown.meta.enter)="submit()"
          (keydown.control.enter)="submit()"
          placeholder="e.g. Which charities appear in the most funding loops?"
          rows="3"
        ></textarea>
        <button (click)="submit()" [disabled]="loading || !question.trim()">
          {{ loading ? 'Thinking...' : 'Ask' }}
        </button>
      </div>

      <p class="error" *ngIf="error">{{ error }}</p>

      <app-results *ngIf="response" [response]="response" />
    </div>
  `,
  styles: [`
    .container {
      max-width: 900px;
      margin: 48px auto;
      padding: 0 24px;
      font-family: sans-serif;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 4px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 24px;
    }
    .input-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }
    textarea {
      flex: 1;
      padding: 12px;
      font-size: 15px;
      border: 1px solid #ccc;
      border-radius: 6px;
      resize: vertical;
    }
    button {
      padding: 12px 24px;
      font-size: 15px;
      background: #1a1a1a;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
    }
    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .error {
      color: #c0392b;
      margin-top: 12px;
    }
  `]
})
export class QueryComponent {
  question = '';
  loading = false;
  error = '';
  response: QueryResponse | null = null;

  constructor(private api: ApiService) {}

  submit(): void {
    if (!this.question.trim() || this.loading) return;

    this.loading = true;
    this.error = '';
    this.response = null;

    this.api.query(this.question).subscribe({
      next: (res) => {
        this.response = res;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.detail ?? 'Something went wrong. Is the backend running?';
        this.loading = false;
      }
    });
  }
}
