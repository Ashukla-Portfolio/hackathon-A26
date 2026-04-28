import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments/environment';

export interface QueryRequest {
  question: string;
}

export interface QueryResponse {
  sql: string;
  results: Record<string, unknown>[];
  summary: string;
  response_type: 'ranking' | 'profile';
  percentage_stat: string | null;
  profile: Record<string, unknown> | null;
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

  health(): Observable<{ status: string }> {
    return this.http.get<{ status: string }>(`${this.baseUrl}/health`);
  }
}
