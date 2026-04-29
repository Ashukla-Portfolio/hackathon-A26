import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface QueryRequest {
  question: string;
}

export interface DashboardStats {
  total_orgs: number;
  total_circular_amt: number;
  avg_risk_score: number;
  total_loops: number;
}

export interface OrgProfile {
  bn: string;
  legal_name: string;
  total_loops: number;
  loops_2hop: number;
  loops_3hop: number;
  loops_4hop: number;
  loops_5hop: number;
  loops_6hop: number;
  score: number;
  total_circular_amt: number;
  circular_inflow: number;
  circular_outflow: number;
  revenue: number;
  total_expenditures: number;
  program_spending: number;
  admin_spending: number;
  broad_overhead_pct: number;
  outlier_flag: boolean;
  fiscal_year: number;
}

export interface QueryResponse {
  sql: string;
  results: Record<string, unknown>[];
  all_results_count: number;
  summary: string;
  percentage_stat: string | null;
  visual_callout: string | null;
  profile_data: Record<string, OrgProfile>;
  stats: DashboardStats;
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  query(question: string): Observable<QueryResponse> {
    const body: QueryRequest = { question };
    return this.http.post<QueryResponse>(`${this.baseUrl}/query`, body);
  }

  getLoops(bn: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/loops/${bn}`);
  }

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/health`);
  }
}
