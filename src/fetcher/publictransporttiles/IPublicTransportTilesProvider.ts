import IPublicTransportTile from "./IPublicTransportTile";

/**
 * Represents one data source of summaries of tiles, e.g. De Lijn or NMBS
 */
export default interface IPublicTransportTilesFetcher {
    prefetchAvailableTiles: () => void;
    getPublicTransportTileById: (stopId: string) => Promise<IPublicTransportTile>;
    getAllAvailableTiles: () => Promise<IPublicTransportTile[]>;
}
