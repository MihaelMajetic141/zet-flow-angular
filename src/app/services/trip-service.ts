import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs'
import { TripData } from '../model/trip-data';

declare global {
  interface Window {
    __env: any;
  }
}
const API_URL = window.__env?.API_BASE_URL || 'http://localhost:8080';

@Injectable({
  providedIn: 'root'
})
export class TripService {
  private baseUrl = API_URL + '/api/trip';

  constructor(private http: HttpClient) {}

  getTripInfo(tripId: string): Observable<TripData> {
    return this.http.get<TripData>(`${this.baseUrl}/getTripInfo/${tripId}`);
  }
}
