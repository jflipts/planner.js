import ILocation from "./ILocation";
import { DistanceM, DurationMs, SpeedKmH } from "./units";

export default interface IQuery {
  from?: string | string[] | ILocation | ILocation[];
  to?: string | string[] | ILocation | ILocation[];
  minimumDepartureTime?: Date;
  maximumArrivalTime?: Date;
  roadOnly?: boolean;
  publicTransportOnly?: boolean;
  walkingSpeed?: SpeedKmH;
  minimumWalkingSpeed?: SpeedKmH;
  maximumWalkingSpeed?: SpeedKmH;
  maximumWalkingDuration?: DurationMs;
  maximumWalkingDistance?: DistanceM;
  minimumTransferDuration?: DurationMs;
  maximumTransferDuration?: DurationMs;
  maximumTransferDistance?: DistanceM;
  maximumTransfers?: number;
}
