import { Container, interfaces } from "inversify";
import Catalog from "../Catalog";
// import catalogDelijnDefault from "../catalog.delijn.local";
import catalogNmbs from "../catalog.nmbs.tiled";
// import catalogNmbs from "../catalog.nmbs.local";
import Context from "../Context";
import RoutableTileRegistry from "../entities/tiles/registry";
import ReachableStopsSearchPhase from "../enums/ReachableStopsSearchPhase";
import RoutingPhase from "../enums/RoutingPhase";
import TravelMode from "../enums/TravelMode";
import ConnectionsFetcherRaw from "../fetcher/connections/ConnectionsFetcherRaw";
import ConnectionsProviderMerge from "../fetcher/connections/ConnectionsProviderMerge";
import IConnectionsFetcher from "../fetcher/connections/IConnectionsFetcher";
import IConnectionsProvider from "../fetcher/connections/IConnectionsProvider";
import FootpathsProviderRaw from "../fetcher/footpaths/FootpathsProviderRaw";
import IFootpathsFetcher from "../fetcher/footpaths/IFootpathsProvider";
import LDFetch from "../fetcher/LDFetch";
import IProfileFetcher from "../fetcher/profiles/IProfileFetcher";
import IProfileProvider from "../fetcher/profiles/IProfileProvider";
import ProfileFetcherDefault from "../fetcher/profiles/ProfileFetcherDefault";
import ProfileProviderDefault from "../fetcher/profiles/ProfileProviderDefault";
import AvailablePublicTransportTilesFetcher from "../fetcher/publictransporttiles/AvailablePublicTransportTilesFetcher";
import AvailablePublicTransportTilesProvider from "../fetcher/publictransporttiles/AvailablePublicTransportTilesProvider";
import IPublicTransportTilesFetcher from "../fetcher/publictransporttiles/IPublicTransportTilesFetcher";
import IPublicTransportTilesProvider from "../fetcher/publictransporttiles/IPublicTransportTilesProvider";
import IStopsFetcher from "../fetcher/stops/IStopsFetcher";
import IStopsProvider from "../fetcher/stops/IStopsProvider";
import StopsFetcherRaw from "../fetcher/stops/StopsFetcherRaw";
import StopsProviderDefault from "../fetcher/stops/StopsProviderDefault";
import IRoutableTileFetcher from "../fetcher/tiles/IRoutableTileFetcher";
import IRoutableTileProvider from "../fetcher/tiles/IRoutableTileProvider";
import RoutableTileFetcherRaw from "../fetcher/tiles/RoutableTileFetcherRaw";
import RoutableTileProviderDefault from "../fetcher/tiles/RoutableTileProviderDefault";
import RoutableTileProviderTransit from "../fetcher/tiles/RoutableTileProviderTransit";

import { LDLoader } from "../loader/ldloader";
import DijkstraTree from "../pathfinding/dijkstra-tree/DijkstraTree";
import MixedDijkstra from "../pathfinding/mixed-dijkstra/MixedDijkstra";
import { IShortestPathAlgorithm, IShortestPathTreeAlgorithm } from "../pathfinding/pathfinder";
import PathfinderProvider from "../pathfinding/PathfinderProvider";
import CSAEarliestArrival from "../planner/public-transport/CSAEarliestArrival";
import CSAEarliestArrivalTiled from "../planner/public-transport/CSAEarliestArrivalTiled";
import IJourneyExtractor from "../planner/public-transport/IJourneyExtractor";
import IPublicTransportPlanner from "../planner/public-transport/IPublicTransportPlanner";
import JourneyExtractorProfile from "../planner/public-transport/JourneyExtractorProfile";
import IRoadPlanner from "../planner/road/IRoadPlanner";
import RoadPlannerPathfinding from "../planner/road/RoadPlannerPathfinding";
import IReachableStopsFinder from "../planner/stops/IReachableStopsFinder";
import ReachableStopsFinderDelaunay from "../planner/stops/ReachableStopsFinderDelaunay";
import ReachableStopsFinderFootpaths from "../planner/stops/ReachableStopsFinderFootpaths";
import ILocationResolver from "../query-runner/ILocationResolver";
import IQueryRunner from "../query-runner/IQueryRunner";
import LocationResolverConvenience from "../query-runner/LocationResolverConvenience";
import QueryRunnerDefault from "../query-runner/QueryRunnerDefault";
import TYPES from "../types";

const container = new Container();
container.bind<Context>(TYPES.Context).to(Context).inSingletonScope();
container.bind<IQueryRunner>(TYPES.QueryRunner).to(QueryRunnerDefault);
container.bind<ILocationResolver>(TYPES.LocationResolver).to(LocationResolverConvenience);

// TODO, make this a fixed property of the planner itself
container.bind<IJourneyExtractor>(TYPES.JourneyExtractor)
  .to(JourneyExtractorProfile);

container.bind<IPublicTransportPlanner>(TYPES.PublicTransportPlanner)
  // .to(CSAEarliestArrival);
  .to(CSAEarliestArrivalTiled);
container.bind<interfaces.Factory<IPublicTransportPlanner>>(TYPES.PublicTransportPlannerFactory)
  .toAutoFactory<IPublicTransportPlanner>(TYPES.PublicTransportPlanner);

container.bind<IRoadPlanner>(TYPES.RoadPlanner)
  .to(RoadPlannerPathfinding);

container.bind<IShortestPathTreeAlgorithm>(TYPES.ShortestPathTreeAlgorithm).to(DijkstraTree).inSingletonScope();
container.bind<IShortestPathAlgorithm>(TYPES.ShortestPathAlgorithm).to(MixedDijkstra).inSingletonScope();
container.bind<PathfinderProvider>(TYPES.PathfinderProvider).to(PathfinderProvider).inSingletonScope();
container.bind<IProfileFetcher>(TYPES.ProfileFetcher).to(ProfileFetcherDefault).inSingletonScope();
container.bind<IProfileProvider>(TYPES.ProfileProvider).to(ProfileProviderDefault).inSingletonScope();

container.bind<IFootpathsFetcher>(TYPES.FootpathsProvider).to(FootpathsProviderRaw).inSingletonScope();

container.bind<IReachableStopsFinder>(TYPES.ReachableStopsFinder)
  .to(ReachableStopsFinderDelaunay).whenTargetTagged("phase", ReachableStopsSearchPhase.Initial);
container.bind<IReachableStopsFinder>(TYPES.ReachableStopsFinder)
  .to(ReachableStopsFinderFootpaths).whenTargetTagged("phase", ReachableStopsSearchPhase.Transfer);
container.bind<IReachableStopsFinder>(TYPES.ReachableStopsFinder)
  .to(ReachableStopsFinderDelaunay).whenTargetTagged("phase", ReachableStopsSearchPhase.Final);

container.bind<IConnectionsProvider>(TYPES.ConnectionsProvider).to(ConnectionsProviderMerge).inSingletonScope();
container.bind<IConnectionsFetcher>(TYPES.ConnectionsFetcher).to(ConnectionsFetcherRaw);
container.bind<interfaces.Factory<IConnectionsFetcher>>(TYPES.ConnectionsFetcherFactory)
  .toFactory<IConnectionsFetcher>(
    (context: interfaces.Context) =>
      (travelMode: TravelMode) => {
        const fetcher = context.container.get<IConnectionsFetcher>(TYPES.ConnectionsFetcher);

        fetcher.setTravelMode(travelMode);

        return fetcher;
      },
  );

container.bind<IStopsProvider>(TYPES.StopsProvider).to(StopsProviderDefault).inSingletonScope();
container.bind<IStopsFetcher>(TYPES.StopsFetcher).to(StopsFetcherRaw);
container.bind<interfaces.Factory<IStopsFetcher>>(TYPES.StopsFetcherFactory)
  .toFactory<IStopsFetcher>(
    (context: interfaces.Context) =>
      (accessUrl: string) => {
        const fetcher = context.container.get<StopsFetcherRaw>(TYPES.StopsFetcher);
        fetcher.setAccessUrl(accessUrl);
        return fetcher;
      },
  );

// Dynamic binding of available tiles fetchers. Tiles/pages themself are fetched trough ConnectionFetchers
container.bind<IPublicTransportTilesProvider>(TYPES.PublicTransportTilesProvider).to(AvailablePublicTransportTilesProvider).inSingletonScope();
container.bind<IPublicTransportTilesFetcher>(TYPES.PublicTransportTilesFetcher).to(AvailablePublicTransportTilesFetcher);
container.bind<interfaces.Factory<IPublicTransportTilesFetcher>>(TYPES.PublicTransportTilesFetcherFactory)
  .toFactory<IPublicTransportTilesFetcher>(
    (context: interfaces.Context) =>
      (accessUrl: string) => {
        const fetcher = context.container.get<AvailablePublicTransportTilesFetcher>(TYPES.PublicTransportTilesFetcher);
        fetcher.setAccessUrl(accessUrl);
        return fetcher;
      },
  );

container.bind<RoutableTileRegistry>(TYPES.RoutableTileRegistry).to(RoutableTileRegistry).inSingletonScope();
container.bind<IRoutableTileFetcher>(TYPES.RoutableTileFetcher).to(RoutableTileFetcherRaw).inSingletonScope();
container.bind<IRoutableTileProvider>(TYPES.RoutableTileProvider)
  .to(RoutableTileProviderDefault).inSingletonScope().whenTargetTagged("phase", RoutingPhase.Base);
container.bind<IRoutableTileProvider>(TYPES.RoutableTileProvider)
  .to(RoutableTileProviderTransit).inSingletonScope().whenTargetTagged("phase", RoutingPhase.Transit);

// Bind catalog
const combined = Catalog.combine(catalogNmbs);
container.bind<Catalog>(TYPES.Catalog).toConstantValue(combined);

// Init LDFetch
container.bind<LDFetch>(TYPES.LDFetch).to(LDFetch).inSingletonScope();

container.bind<LDLoader>(TYPES.LDLoader).to(LDLoader);

export default container;
