import { Injectable, NgZone, Signal, signal } from '@angular/core';
import { Client, IFrame, IMessage, StompSubscription } from '@stomp/stompjs';
import { BehaviorSubject, Subject } from 'rxjs';
import { environment } from '../env/environment';
import { VehicleData } from '../model/vehicle-data';

declare global {
  interface Window {
    __env: any;
  }
}
const WS_URL = window.__env?.API_WS_URL || 'ws://localhost:8080/ws';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  private wsUrl = WS_URL;
  private client: Client;
  private connected = false;

  private connectedSubject = new BehaviorSubject<boolean>(false);
  vehicleData = signal<VehicleData[] | null>(null);
  private errorSubject = new Subject<string>();

  connected$ = this.connectedSubject.asObservable();
  errors$ = this.errorSubject.asObservable();

  private vehicleSub?: StompSubscription;
  private errorSub?: StompSubscription;

  constructor(private zone: NgZone) {
    this.client = new Client({
      brokerURL: this.wsUrl,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      debug: (str: string) => console.log(str)
    });

    this.client.onConnect = (frame: IFrame) => {
      this.connected = true;
      this.zone.run(() => this.connectedSubject.next(true));
      console.log('✅ WebSocket connected', frame.headers);

      this.vehicleSub = this.client.subscribe(
        '/topic/gtfs-updates', (message: IMessage) => {
          this.handleVehicleMessage(message)
        }
      );
      console.log('Subscribed to /topic/gtfs-updates', this.vehicleSub?.id);

      this.errorSub = this.client.subscribe(
        '/topic/error', (message: IMessage) => {
          const text = message.body || 'Unknown error';
          this.zone.run(() => this.errorSubject.next(text));
        }
      );
      console.log('Subscribed to /topic/error', this.errorSub?.id);
    };

    this.client.onDisconnect = () => {
      this.connected = false;
      this.zone.run(() => {
        this.connectedSubject.next(false);
        this.vehicleData.set(null);
      });
      this.cleanupSubscriptions();
      console.log('WebSocket disconnected');
    };

    this.client.onStompError = (frame: IFrame) => {
      console.error('Broker reported error: ' + frame.headers['message']);
      console.error('Detailed error: ' + frame.body);
      this.zone.run(() => this.errorSubject.next(frame.body || 'STOMP error'));
    };
  }

  connect() {
    if (this.connected || this.client.active) return;
    console.log('Attempting to connect to WebSocket...');
    this.client.activate();
  }

  disconnect() {
    if (this.client && this.client.active) {
      this.client.deactivate();
      this.connected = false;
      this.zone.run(() => this.connectedSubject.next(false));
    }
    this.cleanupSubscriptions();
  }

  private cleanupSubscriptions() {
    try {
      if (this.vehicleSub) {
        this.vehicleSub.unsubscribe();
        this.vehicleSub = undefined;
      }
      if (this.errorSub) {
        this.errorSub.unsubscribe();
        this.errorSub = undefined;
      }
    } catch (err) {
      console.warn('Error while unsubscribing', err);
    }
  }

  private handleVehicleMessage(message: IMessage) {
    if (!message || !message.body) {
      return;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(message.body);
    } catch (err) {
      console.error('Failed to JSON.parse WebSocket body', err, message.body);
      this.zone.run(() => this.errorSubject.next('Invalid JSON in vehicle-data payload'));
      return;
    }

    const vehicles: VehicleData[] = [];

    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const v = this.mapToVehicleData(item);
        if (v) vehicles.push(v);
      }
    } else if (parsed && typeof parsed === 'object') {
      const v = this.mapToVehicleData(parsed);
      if (v) vehicles.push(v);
    } else {
      console.warn('Unexpected vehicle-data payload shape', parsed);
    }

    this.zone.run(() => this.vehicleData.set(vehicles.length > 0 ? vehicles : []));
  }

  private mapToVehicleData(item: any): VehicleData | null {
    if (!item || typeof item !== 'object') return null;

    const id = item.id as string | undefined;
    const routeId = item.routeId as string | undefined;
    const routeType = item.routeType as string | undefined;
    const routeLongName = item.routeLongName as string | undefined;
    const rawLat = item.latitude as unknown;
    const rawLon = item.longitude as unknown;
    const tripId = item.tripId as string | undefined;

    const latitude = rawLat === undefined || rawLat === null ? undefined : Number(rawLat);
    const longitude = rawLon === undefined || rawLon === null ? undefined : Number(rawLon);

    if (!id || isNaN(latitude as number) || isNaN(longitude as number)) return null;

    const result: VehicleData = { id: id, routeId: routeId, routeType: routeType, routeLongName: routeLongName, latitude: latitude, longitude: longitude, tripId: tripId };
    return result;
  }

  public emitError(error: string): void {
    this.errorSubject.next(error);
  }

  getVehicleData(): Signal<VehicleData[]> {
    return this.vehicleData as Signal<VehicleData[]>;
  }
}