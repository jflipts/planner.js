
/**
 * Interface for a public transport tile.
 * @property id An identifier for the stop that gets used in IConnections
 * @property name Display name of the stop
 */
export default interface IStop {
  id: string;
  zoom: number;
  x: number;
  y: number;
}
