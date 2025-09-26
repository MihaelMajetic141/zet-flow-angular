import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, effect, inject, signal } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as Leaflet from 'leaflet';
import { VehicleData } from '../../model/vehicle-data';
import { WebSocketService } from '../../services/websocket-service';
import { TripService } from '../../services/trip-service';
import { TripData } from '../../model/trip-data';

export interface SearchResult {
  routeId: string;
  routeName: string;
  routeType: string;
}

@Component({
  selector: 'map-component',
  templateUrl: './map-component.html',
  styleUrls: ['./map-component.css']
})
export class MapComponent implements AfterViewInit, OnDestroy {
  private ws: WebSocketService = inject(WebSocketService);
  private tripService: TripService = inject(TripService);
  private sanitizer: DomSanitizer = inject(DomSanitizer);
  private map!: Leaflet.Map;
  private vehicleMarkers: Map<string, Leaflet.Marker> = new Map();
  private stopMarkers: Map<string, Leaflet.Marker> = new Map();
  private activeMarkerId = signal<string | null>(null);
  private vehicles = this.ws.getVehicleData();
  private selectedVehicle = signal<VehicleData | null>(null);
  private userInteracted = false;
  searchTerm = signal<string>('');
  searchResults = signal<SearchResult[]>([]);
  showDropdown = signal(false);
  tripDetails = signal<TripData | null>(null);
  errorMessage = signal<string | null>(null);
  darkMode = false;

  @ViewChild('searchBar') searchBar!: ElementRef;

  private readonly TRAM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-tram-front-icon lucide-tram-front"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>`;
  private readonly BUS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bus-icon lucide-bus"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`;

  private readonly TRAM_COLOR = '#2c8bffff';
  private readonly BUS_COLOR = '#294cc2ff';

  constructor() {
    effect(() => {
      const vehiclesData = this.vehicles();
      const term = this.searchTerm();
      if (term) {
        const filtered = vehiclesData.filter(v =>
          v.routeId?.toLowerCase().includes(term.toLowerCase()) ||
          v.routeLongName?.toLowerCase().includes(term.toLowerCase())
        );

        const uniqueRoutes = new Map<string, SearchResult>();
        filtered.forEach(v => {
          const rid = v.routeId ?? '';
          if (rid && !uniqueRoutes.has(rid)) {
            uniqueRoutes.set(rid, {
              routeId: rid,
              routeName: v.routeLongName ?? '',
              routeType: v.routeType ?? ''
            });
          }
        });

        this.searchResults.set(Array.from(uniqueRoutes.values()));
      } else {
        this.searchResults.set([]);
      }
      const activeId = this.activeMarkerId();
      this.updateVehicleMarkers(vehiclesData, term, activeId);
    });

    effect(() => {
      const trip = this.tripDetails();
      if (trip) {
        this.addStopMarkers(trip);
      } else {
        this.clearStopMarkers();
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.ws.connect();
  }

  private initMap(): void {
    this.map = Leaflet.map('map', { zoomControl: false }).setView([45.8, 15.985], 12);

    Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
      minZoom: 10
    }).addTo(this.map);

    Leaflet.control.zoom({
      position: 'bottomleft'
    }).addTo(this.map);

    this.map.on('dragstart', () => {
      this.userInteracted = true;
    });
  }

  private updateVehicleMarkers(vehiclesData: VehicleData[] | null, searchTerm: string, activeMarkerId: string | null): void {
    if (!vehiclesData) {
      this.clearVehicleMarkers();
      return;
    }

    const term = searchTerm.toLowerCase();
    const filteredVehicles = term ? vehiclesData.filter(vehicle =>
      vehicle.routeId?.toLowerCase().includes(term) || vehicle.routeLongName?.toLowerCase().includes(term)
    ) : vehiclesData;

    const currentIds = new Set<string>();

    filteredVehicles.forEach(vehicle => {
      if (vehicle.id && vehicle.latitude !== undefined && vehicle.longitude !== undefined) {
        const id = vehicle.id;
        currentIds.add(id);
        this.updateOrCreateVehicleMarker(vehicle, id);
      }
    });

    this.vehicleMarkers.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        this.vehicleMarkers.delete(id);
      }
    });

    if (this.vehicleMarkers.size > 0) {
      if (activeMarkerId && this.vehicleMarkers.has(activeMarkerId)) {
        const marker = this.vehicleMarkers.get(activeMarkerId)!;

        if (!this.userInteracted) {
          const latLng: Leaflet.LatLngExpression = marker.getLatLng();
          this.map.flyTo(latLng, 16, { duration: 2 });
        }
      }
    }
  }

  private updateOrCreateVehicleMarker(vehicle: VehicleData, id: string): void {
    const latLng: Leaflet.LatLngExpression = [vehicle.latitude!, vehicle.longitude!];
    const hasSelection = this.activeMarkerId() !== null;
    const isSelected = this.activeMarkerId() === id;

    if (this.vehicleMarkers.has(id)) {
      const existing = this.vehicleMarkers.get(id)!;
      existing.setLatLng(latLng);
      const newHtmlIcon = this.createLeafletIcon(vehicle.routeType, vehicle.routeId, isSelected, hasSelection);
      existing.setIcon(newHtmlIcon);
    }
    else {
      const icon = this.createLeafletIcon(vehicle.routeType, vehicle.routeId, isSelected, hasSelection);
      const marker = Leaflet.marker(latLng, { icon })
        .addTo(this.map);

      marker.on('click', () => {
        this.selectedVehicle.set(vehicle);
        this.activeMarkerId.set(id);
        this.fetchTripDetails(vehicle.tripId ?? '');

        this.userInteracted = false;
        this.map.flyTo(latLng, 17, { duration: 1.5 });
      });

      this.vehicleMarkers.set(id, marker);
    }
  }

  private fetchTripDetails(tripId: string): void {
    if (!tripId) {
      console.error('No tripId available');
      this.errorMessage.set('Trip cannot be found by id because backend fetches latest data which can be one day ahead. ' +
        'Go fix GtfsService static link in back-end.');
      this.tripDetails.set(null);
      return;
    }
    this.tripService.getTripInfo(tripId).subscribe({
      next: (data) => {
        if (data) {
          this.tripDetails.set(data)
        }
      },
      error: (err) => console.error('Error fetching trip details:', err)
    });
  }

  private addStopMarkers(trip: TripData): void {
    this.clearStopMarkers();

    trip.stopTimes?.forEach((stop, index) => {
      if (stop.latitude !== null && stop.longitude !== null) {
        const latLng: Leaflet.LatLngExpression = [stop.latitude, stop.longitude];
        const key = `${stop.stopName}-${index}`; // Unique key

        const marker = Leaflet.marker(latLng, {
          icon: Leaflet.icon({
            iconUrl: 'https://img.icons8.com/ios-filled/50/000000/bus-stop.png', // Free bus stop icon
            iconSize: [25, 25],
            iconAnchor: [12, 25],
            popupAnchor: [0, -25]
          })
        }).addTo(this.map);

        // Optional: Bind simple popup for stop details
        marker.bindPopup(`
          <b>Stop:</b> ${stop.stopName ?? 'N/A'}<br>
          <b>Arrival:</b> ${stop.arrivalTime ?? 'N/A'}
        `);

        this.stopMarkers.set(key, marker);
      }
    });

    // Optional: Fit bounds to include stops
    // if (this.stopMarkers.size > 0) {
    //   const group = Leaflet.featureGroup(Array.from(this.stopMarkers.values()));
    //   this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
    // }
  }

  flyToStop(stop: { latitude: number | null; longitude: number | null }) {
    if (stop.latitude !== null && stop.longitude !== null) {
      const latLng: Leaflet.LatLngExpression = [stop.latitude, stop.longitude];
      this.map.flyTo(latLng, 17, { duration: 1.5 });
      this.userInteracted = true;
    }
  }


  private createLeafletIcon(routeType: string | undefined, routeId: string | undefined, isSelected: boolean, hasSelection: boolean): Leaflet.DivIcon {
    return Leaflet.divIcon({
      className: '', // we use our own classes inside the html
      html: this.buildVehicleIconHtml(routeType, routeId, isSelected, hasSelection),
      iconSize: [40, 48],
      iconAnchor: [20, 44], // anchor at the bottom center of the div
      popupAnchor: [0, -46]
    });
  }

  private buildVehicleIconHtml(routeType: string | undefined, routeId: string | undefined, isSelected: boolean, hasSelection: boolean): string {
    const id = routeId ?? '';
    let svg = '';
    let color = this.BUS_COLOR;

    if (routeType === "0") {
      svg = this.TRAM_SVG;
      color = this.TRAM_COLOR;
    } else if (routeType === "3") {
      svg = this.BUS_SVG;
      color = this.BUS_COLOR;
    } else {
      svg = this.BUS_SVG;
      color = '#6B7280';
    }

    const opacity = hasSelection ? (isSelected ? 1.0 : 0.3) : 1.0;

    return `
      <div class="vehicle-marker" style="color: white; background-color: ${color}; opacity:${opacity}; width: 32px; height: 32px; padding-top:4px; display: flex; flex-direction: column; align-items: center; border-radius: 28px; font-family: Inter, Arial, sans-serif;">
        <div class="vehicle-icon" aria-hidden="true">${svg}</div>
        <div class="route-id" style="transform: translateY(-6px); font-size:10px; font-weight:bold;">${id}</div>
      </div>
    `;
  }

  getVehicleIcon(routeType: string | undefined): SafeHtml {
    let svg: string;
    if (routeType === "0") {
      svg = this.TRAM_SVG;
    } else if (routeType === "3") {
      svg = this.BUS_SVG;
    } else {
      svg = this.BUS_SVG; // Default
    }
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  getVehicleColor(routeType: string | undefined): string {
    if (routeType === "0") return this.TRAM_COLOR;
    if (routeType === "3") return this.BUS_COLOR;
    return '#6B7280';
  }

  selectRoute(result: SearchResult): void {
    this.searchTerm.set(result.routeName);
    this.showDropdown.set(false);
    this.closeSidebar();
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.showDropdown.set(false);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.searchBar && !this.searchBar.nativeElement.contains(event.target)) {
      this.showDropdown.set(false);
    }
  }

  private clearVehicleMarkers(): void {
    this.vehicleMarkers.forEach(marker => {
      marker.remove();
      marker.off('click'); // Clean up click listener
    });
    this.vehicleMarkers.clear();
  }

  private clearStopMarkers(): void {
    this.stopMarkers.forEach(marker => {
      marker.remove();
    });
    this.stopMarkers.clear();
  }

  closeSidebar(): void {
    this.selectedVehicle.set(null);
    this.tripDetails.set(null);
    this.activeMarkerId.set(null);
    this.clearStopMarkers();
  }

  ngOnDestroy(): void {
    this.ws.disconnect();
    this.clearVehicleMarkers();
    this.clearStopMarkers();
    this.map.remove();
  }
}