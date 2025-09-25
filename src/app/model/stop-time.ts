import { LocalTime } from "./local-time";

export interface StopTime {
  stopName: string | null;
  arrivalTime: LocalTime | null;
  departureTime: LocalTime | null;
  latitude: number | null;
  longitude: number | null;
}