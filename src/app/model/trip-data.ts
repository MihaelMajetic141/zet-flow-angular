import { StopTime } from "./stop-time";

export interface TripData {
  tripId: string;
  routeId: string | null;
  routeName: string | null;
  stopTimes: Array<StopTime> | null;
}
