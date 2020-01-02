import { ArrayIterator, AsyncIterator } from "asynciterator";
import { EventEmitter } from "events";
import { inject, injectable, tagged } from "inversify";
import Catalog from "../../Catalog";
import IConnection from "../../entities/connections/connections";
import DropOffType from "../../enums/DropOffType";
import PickupType from "../../enums/PickupType";
import ReachableStopsFinderMode from "../../enums/ReachableStopsFinderMode";
import ReachableStopsSearchPhase from "../../enums/ReachableStopsSearchPhase";
import TravelMode from "../../enums/TravelMode";
import EventBus from "../../events/EventBus";
import EventType from "../../events/EventType";
import ConnectionsProviderDefault from "../../fetcher/connections/ConnectionsProviderDefault";
import IConnectionsProvider from "../../fetcher/connections/IConnectionsProvider";
import IPublicTransportTile from "../../fetcher/publictransporttiles/IPublicTransportTile";
import IPublicTransportTilesProvider from "../../fetcher/publictransporttiles/IPublicTransportTilesProvider";
import IStop from "../../fetcher/stops/IStop";
import ILocation from "../../interfaces/ILocation";
import IPath from "../../interfaces/IPath";
import ILocationResolver from "../../query-runner/ILocationResolver";
import IResolvedQuery from "../../query-runner/IResolvedQuery";
import TYPES, { ConnectionsFetcherFactory } from "../../types";
import Geo from "../../util/Geo";
import MergeIterator from "../../util/iterators/MergeIterator";
import IReachableStopsFinder, { IReachableStop } from "../stops/IReachableStopsFinder";
import IProfileByStop from "./CSA/data-structure/stops/IProfileByStop";
import ITransferProfile from "./CSA/data-structure/stops/ITransferProfile";
import IEnterConnectionByTrip from "./CSA/data-structure/trips/IEnterConnectionByTrip";
import FootpathQueue from "./CSA/FootpathQueue";
import IJourneyExtractor from "./IJourneyExtractor";
import IPublicTransportPlanner from "./IPublicTransportPlanner";
import JourneyExtractorEarliestArrival from "./JourneyExtractorEarliestArrival";
import TileFetchStrategyLineIterator from "./tiles/TileFetchStrategyLineIterator";

import FilterUniqueIterator from "../../util/iterators/FilterUniqueIterator";
import FlatMapIterator from "../../util/iterators/FlatMapIterator";
import Path from "../Path";

import { PromiseProxyIterator } from "asynciterator-promiseproxy";
import TileFetchStrategyExpandingQueryIterator from "./tiles/TileFetchStrategyExpandingQueryIterator";
import TileFetchStrategyLineQueryIterator from "./tiles/TileFetchStrategyLineQueryIterator";

interface IFinalReachableStops {
  [stop: string]: IReachableStop;
}

interface IQueryState {
  finalReachableStops: IFinalReachableStops;
  profilesByStop: IProfileByStop; // S
  enterConnectionByTrip: IEnterConnectionByTrip; // T
  footpathsQueue: FootpathQueue;
  connectionsQueue: AsyncIterator<IConnection>;
}

interface IResolvedQueryTiled extends IResolvedQuery {
  tilesToFetch: Set<IPublicTransportTile>;
}

// Implementation is as close as possible to the original paper: https://arxiv.org/pdf/1703.05997.pdf

@injectable()
export default class CSAEarliestArrivalTiled implements IPublicTransportPlanner {
  private static forwardsConnectionSelector(connections: IConnection[]): number {
    if (connections.length === 1) {
      return 0;
    }

    let earliestIndex = 0;
    let earliest = connections[0];

    for (let i = 1; i < connections.length; i++) {
      const connection = connections[i];

      if (connection && connection.departureTime < earliest.departureTime) {
        earliest = connection;
        earliestIndex = i;
      }
    }

    return earliestIndex;
  }

  protected readonly connectionsProvider: IConnectionsProvider;
  protected readonly locationResolver: ILocationResolver;
  protected readonly transferReachableStopsFinder: IReachableStopsFinder;
  protected readonly initialReachableStopsFinder: IReachableStopsFinder;
  protected readonly finalReachableStopsFinder: IReachableStopsFinder;
  protected readonly catalog: Catalog;
  protected readonly connectionsFetcherFactory;
  protected readonly eventBus: EventEmitter;
  protected readonly availablePublicTransportTilesProvider: IPublicTransportTilesProvider;

  protected journeyExtractor: IJourneyExtractor;
  private tilesToFetchIterator: AsyncIterator<IResolvedQueryTiled>;

  constructor(
    @inject(TYPES.ConnectionsProvider)
    connectionsProvider: IConnectionsProvider,
    @inject(TYPES.LocationResolver)
    locationResolver: ILocationResolver,
    @inject(TYPES.ReachableStopsFinder)
    @tagged("phase", ReachableStopsSearchPhase.Transfer)
    transferReachableStopsFinder: IReachableStopsFinder,
    @inject(TYPES.ReachableStopsFinder)
    @tagged("phase", ReachableStopsSearchPhase.Initial)
    initialReachableStopsFinder: IReachableStopsFinder,
    @inject(TYPES.ReachableStopsFinder)
    @tagged("phase", ReachableStopsSearchPhase.Final)
    finalReachableStopsFinder: IReachableStopsFinder,
    @inject(TYPES.Catalog) catalog: Catalog,
    @inject(TYPES.ConnectionsFetcherFactory) connectionsFetcherFactory: ConnectionsFetcherFactory,
    @inject(TYPES.PublicTransportTilesProvider)
    availablePublicTransportTilesProvider: IPublicTransportTilesProvider,
  ) {
    this.connectionsProvider = connectionsProvider;
    this.locationResolver = locationResolver;
    this.transferReachableStopsFinder = transferReachableStopsFinder;
    this.initialReachableStopsFinder = initialReachableStopsFinder;
    this.finalReachableStopsFinder = finalReachableStopsFinder;
    this.catalog = catalog;
    this.connectionsFetcherFactory = connectionsFetcherFactory;
    this.eventBus = EventBus.getInstance();
    this.journeyExtractor = new JourneyExtractorEarliestArrival(locationResolver);
    this.availablePublicTransportTilesProvider = availablePublicTransportTilesProvider;
  }

  public async plan(query: IResolvedQuery): Promise<AsyncIterator<IPath>> {
    // TODO: This is hardcoded and should be injected trough a factory
    // this.tilesToFetchIterator = new TileFetchStrategyLineQueryIterator(
    //   this.availablePublicTransportTilesProvider, query);
    this.tilesToFetchIterator = new TileFetchStrategyExpandingQueryIterator(
      this.availablePublicTransportTilesProvider, query);

    // Iterator that combines all iterators returned by the second argument.
    // Second argument will be run with a query pulled from first argument.
    // First argument is an iterator that provides queries with a tilesToFetch field
    const subqueryIterator = new FlatMapIterator<IResolvedQueryTiled, IPath>(
      this.tilesToFetchIterator,
      runPlannerWithSource.bind(this),
    );

    // Nested function to deal with the Promise
    function runPlannerWithSource(queryTiled: IResolvedQueryTiled): AsyncIterator<IPath> {
      return new PromiseProxyIterator(() => this.runPlanner(queryTiled));
    }

    // Running the planner with different tilesToFetch sets may result in same result, filter those
    return new FilterUniqueIterator<IPath>(subqueryIterator, Path.compareEquals);
  }

  protected async runPlanner(query: IResolvedQueryTiled): Promise<AsyncIterator<IPath>> {
    const {
      minimumDepartureTime: lowerBoundDate,
      maximumArrivalTime: upperBoundDate,
      tilesToFetch: tilesToFetch,
    } = query;

    if (tilesToFetch && !this.tilesToFetchIterator.closed) {

      // For each tile create a catalog and for each catalog a ConnectionProvider
      const tileIterators = [];
      tilesToFetch.forEach((value: IPublicTransportTile, _1, _2) => {
        const tileCatalog = new Catalog();
        let { accessUrl } = this.catalog.connectionsSourceConfigs[0];
        const { travelMode } = this.catalog.connectionsSourceConfigs[0];
        accessUrl = accessUrl.replace("{zoom}", value.zoom.toString());
        accessUrl = accessUrl.replace("{x}", value.x.toString());
        accessUrl = accessUrl.replace("{y}", value.y.toString());
        tileCatalog.addConnectionsSource(accessUrl, travelMode);

        const connectionProvider = new ConnectionsProviderDefault(this.connectionsFetcherFactory, tileCatalog);

        const tileIterator = connectionProvider.createIterator({
          upperBoundDate,
          lowerBoundDate,
          excludedModes: query.excludedTravelModes,
        });
        tileIterators.push(tileIterator);
      });

      // Create a MergeIterator over all the tiles
      const connectionsIterator = new MergeIterator(
        tileIterators,
        CSAEarliestArrivalTiled.forwardsConnectionSelector,
        true,
      );

      const footpathsQueue = new FootpathQueue();

      const connectionsQueue = new MergeIterator(
        [connectionsIterator, footpathsQueue],
        CSAEarliestArrivalTiled.forwardsConnectionSelector,
        true,
      );

      const queryState: IQueryState = {
        finalReachableStops: {},
        profilesByStop: {},
        enterConnectionByTrip: {},
        footpathsQueue,
        connectionsQueue,
      };

      const [hasInitialReachableStops, hasFinalReachableStops] = await Promise.all([
        this.initInitialReachableStops(queryState, query),
        this.initFinalReachableStops(queryState, query),
      ]);

      if (!hasInitialReachableStops || !hasFinalReachableStops) {
        return Promise.resolve(new ArrayIterator([]));
      }

      const self = this;
      return new Promise((resolve, reject) => {
        let isDone: boolean = false;

        const done = () => {
          if (!isDone) {
            connectionsQueue.close();

            self.extractJourneys(queryState, query)
              .then((resultIterator) => {
                resolve(resultIterator);
              });

            isDone = true;
          }
        };

        connectionsIterator.on("readable", () =>
          self.processConnections(queryState, query, done),
        );

        connectionsIterator.on("end", () => done());

        // iterator may have become readable before the listener was attached
        self.processConnections(queryState, query, done);

      }) as Promise<AsyncIterator<IPath>>;
    }
  }

  protected updateProfile(state: IQueryState, query: IResolvedQuery, connection: IConnection) {
    /*
    Call this ONLY if the given connection is known to improve the arrival stop's profile
    */

    const tripId = connection.tripId;
    const departureTime = connection.departureTime.getTime();
    const arrivalTime = connection.arrivalTime.getTime();

    // update profile of arrival stop
    const arrivalProfile: ITransferProfile = {
      departureTime,
      arrivalTime,
      exitConnection: connection,
      enterConnection: state.enterConnectionByTrip[tripId],
    };
    state.profilesByStop[connection.arrivalStop] = arrivalProfile;
  }

  private async extractJourneys(state: IQueryState, query: IResolvedQuery): Promise<AsyncIterator<IPath>> {
    return this.journeyExtractor.extractJourneys(state.profilesByStop, query);
  }

  private async processConnections(state: IQueryState, query: IResolvedQuery, resolve: () => void) {
    const { from, to, minimumDepartureTime } = query;
    const departureStopId: string = from[0].id;
    const arrivalStopId: string = to[0].id;

    let connection: IConnection = state.connectionsQueue.read();

    while (connection && !state.connectionsQueue.closed) {

      if (connection.departureTime < minimumDepartureTime && !state.connectionsQueue.closed) {
        // starting criterion
        // skip connections before the minimum departure time
        connection = state.connectionsQueue.read();
        continue;
      }

      if (this.getProfile(state, arrivalStopId).arrivalTime <= connection.departureTime.getTime()) {
        // stopping criterion
        // we cannot improve the tentative arrival time anymore
        return resolve();
      }

      const tripId = connection.tripId;
      const departureTime = connection.departureTime.getTime();

      const canRemainSeated = state.enterConnectionByTrip[tripId];
      const canTakeTransfer = (
        (
          connection.departureStop === departureStopId ||
          this.getProfile(state, connection.departureStop).arrivalTime <= departureTime
        ) &&
        connection.pickupType !== PickupType.NotAvailable
      );

      if (canRemainSeated || canTakeTransfer) {
        // enterConnectionByTrip should point to the first reachable connection
        if (!state.enterConnectionByTrip[tripId]) {
          state.enterConnectionByTrip[tripId] = connection;
        }

        // limited walking optimization
        const canImprove = connection.arrivalTime.getTime() <
          this.getProfile(state, connection.arrivalStop).arrivalTime;
        const canLeave = connection.dropOffType !== DropOffType.NotAvailable;

        if (canLeave && canImprove) {
          this.updateProfile(state, query, connection);
          await this.scheduleExtraConnections(state, query, connection);
        }
      }

      if (!state.connectionsQueue.closed) {
        connection = state.connectionsQueue.read();
        continue;
      }

      connection = undefined;
    }
  }

  private getProfile(state: IQueryState, stopId: string): ITransferProfile {
    if (!state.profilesByStop[stopId]) {
      state.profilesByStop[stopId] = {
        departureTime: Infinity,
        arrivalTime: Infinity,
      };
    }
    return state.profilesByStop[stopId];
  }

  private async scheduleExtraConnections(state: IQueryState, query: IResolvedQuery, sourceConnection: IConnection) {
    try {
      const arrivalStop: ILocation = await this.locationResolver.resolve(sourceConnection.arrivalStop);
      const reachableStops: IReachableStop[] = await this.transferReachableStopsFinder.findReachableStops(
        arrivalStop as IStop,
        ReachableStopsFinderMode.Source,
        query.maximumTransferDuration,
        query.minimumWalkingSpeed,
        query.profileID,
      );

      if (state.finalReachableStops[arrivalStop.id]) {
        reachableStops.push(state.finalReachableStops[arrivalStop.id]);
      }

      for (const reachableStop of reachableStops) {
        const { stop: stop, duration: duration } = reachableStop;

        if (duration && stop.id) {
          const transferTentativeArrival = this.getProfile(state, stop.id).arrivalTime;
          const newArrivalTime = new Date(sourceConnection.arrivalTime.getTime() + duration);

          if (transferTentativeArrival > newArrivalTime.getTime() && newArrivalTime <= query.maximumArrivalTime) {
            // create a connection that resembles a footpath
            // TODO, ditch the IReachbleStop and IConnection interfaces and make these proper objects
            const transferConnection: IConnection = {
              id: `TRANSFER_TO:${stop.id}`,
              tripId: `TRANSFER_TO:${stop.id}`,
              travelMode: TravelMode.Walking,  // TODO, this should be part of the reachable stop object
              departureTime: sourceConnection.arrivalTime,
              departureStop: sourceConnection.arrivalStop,
              arrivalTime: new Date(sourceConnection.arrivalTime.getTime() + duration),
              arrivalStop: stop.id,
              dropOffType: DropOffType.Regular,
              pickupType: PickupType.Regular,
              headsign: stop.id,
            };

            state.footpathsQueue.write(transferConnection);
          }
        }
      }
    } catch (e) {
      if (this.eventBus) {
        this.eventBus.emit(EventType.Warning, (e));
      }
    }
  }

  private async initInitialReachableStops(state: IQueryState, query: IResolvedQuery): Promise<boolean> {
    const fromLocation: ILocation = query.from[0];

    // Making sure the departure location has an id
    const geoId = Geo.getId(fromLocation);
    if (!fromLocation.id) {
      query.from[0].id = geoId;
      query.from[0].name = "Departure location";
    }

    const reachableStops = await this.initialReachableStopsFinder.findReachableStops(
      fromLocation,
      ReachableStopsFinderMode.Source,
      query.maximumWalkingDuration,
      query.minimumWalkingSpeed,
      query.profileID,
    );

    // Abort when we can't reach a single stop.
    if (reachableStops.length === 0) {
      this.eventBus.emit(EventType.AbortQuery, "No reachable stops at departure location");

      return false;
    }

    if (this.eventBus) {
      this.eventBus.emit(EventType.InitialReachableStops, reachableStops);
    }

    for (const reachableStop of reachableStops) {
      const { stop: stop, duration: duration } = reachableStop;

      if (duration) {
        // create a connection that resembles a footpath
        // TODO, ditch the IReachbleStop and IConnection interfaces and make these proper objects
        const transferConnection: IConnection = {
          id: `MOVE_TO:${stop.id}`,
          tripId: `MOVE_TO:${stop.id}`,
          travelMode: TravelMode.Walking,  // TODO, this should be part of the reachable stop object
          departureTime: query.minimumDepartureTime,
          departureStop: fromLocation.id,
          arrivalTime: new Date(query.minimumDepartureTime.getTime() + duration),
          arrivalStop: stop.id,
          dropOffType: DropOffType.Regular,
          pickupType: PickupType.Regular,
          headsign: stop.id,
        };

        state.footpathsQueue.write(transferConnection);
      }
    }

    return true;
  }

  private async initFinalReachableStops(state: IQueryState, query: IResolvedQuery): Promise<boolean> {
    const toLocation: ILocation = query.to[0];

    // Making sure the departure location has an id
    const geoId = Geo.getId(toLocation);
    if (!toLocation.id) {
      query.to[0].id = geoId;
      query.to[0].name = "Arrival location";
    }

    const reachableStops = await this.finalReachableStopsFinder.findReachableStops(
      toLocation,
      ReachableStopsFinderMode.Target,
      query.maximumWalkingDuration,
      query.minimumWalkingSpeed,
      query.profileID,
    );

    // Abort when we can't reach a single stop.
    if (reachableStops.length === 0) {
      this.eventBus.emit(EventType.AbortQuery, "No reachable stops at arrival location");

      return false;
    }

    if (this.eventBus) {
      this.eventBus.emit(EventType.FinalReachableStops, reachableStops);
    }

    for (const reachableStop of reachableStops) {
      if (reachableStop.duration > 0) {
        state.finalReachableStops[reachableStop.stop.id] = {
          stop: toLocation as IStop,
          duration: reachableStop.duration,
        };
      }
    }

    return true;
  }
}
