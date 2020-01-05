import IPublicTransportTile from "../../fetcher/publictransporttiles/IPublicTransportTile";
import IResolvedQuery from "../../query-runner/IResolvedQuery";

export default interface IResolvedQueryTiled extends IResolvedQuery {
    tilesToFetch: Set<IPublicTransportTile>;
}
