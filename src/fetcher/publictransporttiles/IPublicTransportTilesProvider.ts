import IResolvedQuery from "../../query-runner/IResolvedQuery";
import IPublicTransportTile from "./IPublicTransportTile";

/**
 * Represents one data source of summaries of tiles, e.g. De Lijn or NMBS
 */
export default interface IPublicTransportTilesFetcher {
    prefetchAvailableTiles: () => void;
    getPublicTransportTileById: (stopId: string) => Promise<IPublicTransportTile>;
    getAllAvailableTiles: () => Promise<IPublicTransportTile[]>;
    getAllTilesIntersectingWithLine?: (
        line: { x1: number, y1: number, x2: number, y2: number },
        query: IResolvedQuery,
    ) => Promise<IPublicTransportTile[]>;
}
