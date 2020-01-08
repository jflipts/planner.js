import { AsyncIterator } from "asynciterator";
import { inject, injectable } from "inversify";
import Catalog from "../../../Catalog";
import AvailablePublicTransportTilesProviderTree from "../../../fetcher/publictransporttiles/AvailablePublicTransportTilesProviderTree";
import IPublicTransportTile from "../../../fetcher/publictransporttiles/IPublicTransportTile";
import IPublicTransportTilesProvider from "../../../fetcher/publictransporttiles/IPublicTransportTilesProvider";
import ILocation from "../../../interfaces/ILocation";
import IResolvedQuery from "../../../query-runner/IResolvedQuery";
import TYPES from "../../../types";
import IResolvedQueryTiled from "../IResolvedQueryTiled";
import Slippy from "./Slippy";

// IResolvedQueryTiled Iterator that returns a set of tiles

// Only works with availablePublicTransportTilesProvider of type AvailablePublicTransportTilesProviderTree
// Cannot inject this class because AsyncIterator cannot be injected
export default class TileFetchStrategyTreeQueryIterator extends AsyncIterator<IResolvedQueryTiled> {

    protected readonly availablePublicTransportTilesProvider: IPublicTransportTilesProvider;
    protected readonly catalog: Catalog;
    protected readonly query;

    // Internal variable keeping track of the next complete query that may be read
    private value: IResolvedQueryTiled;
    // Number of queries that have been read
    private readQueryCounter: number = 0;
    // Previous tile candidates to build further upon
    private tileCandidatesPrevious: Map<string, { zoom: number, x: number, y: number }>;

    constructor(
        @inject(TYPES.PublicTransportTilesProvider)
        availablePublicTransportTilesProvider: IPublicTransportTilesProvider,
        @inject(TYPES.Catalog) catalog: Catalog,
        query: IResolvedQuery,
    ) {
        super();

        if (!(availablePublicTransportTilesProvider instanceof AvailablePublicTransportTilesProviderTree)) {
            throw new Error("Incorrect PublicTransportTileProvider");
        }
        this.availablePublicTransportTilesProvider = availablePublicTransportTilesProvider;
        this.catalog = catalog;
        this.query = query;

        this.availablePublicTransportTilesProvider.prefetchAvailableTiles();
    }

    // TODO: implement locks on value
    public read(): IResolvedQueryTiled {
        if (this.closed) {
            return null;
        }

        // Maximum number of times the Iterator should return a readable value
        if (this.readQueryCounter > 0) {
            this.close();
            return null;
        }

        // Value should be null afterwards
        if (this.value) {

            this.readQueryCounter++;

            const temp = this.value;
            this.value = null;

            return temp;
        } else {
            this.readable = false;
            this.runQuery();

            return undefined;
        }
    }

    private async runQuery() {

        const fromLocation: ILocation = this.query.from[0];
        const toLocation: ILocation = this.query.to[0];
        const line = {
            x1: fromLocation.longitude,
            y1: fromLocation.latitude,
            x2: toLocation.longitude,
            y2: toLocation.latitude,
        };

        const tilesToFetch = await this.availablePublicTransportTilesProvider
            .getAllTilesIntersectingWithLine(line, this.query);
        this.value = this.query;
        this.value.tilesToFetch = new Set(tilesToFetch);
        this.readable = true;
        return;

        // // Keep track of all the tiles that could possibly be fetched
        // let tileCandidates: Map<string, { zoom: number, x: number, y: number }>;

        // if (this.tileCandidatesPrevious) {
        //     // Set of old tileCandidates exists; Expand it
        //     tileCandidates = new Map([...this.tileCandidatesPrevious]);

        //     for (const currentTile of this.tileCandidatesPrevious.values()) {
        //         const rightTile = { zoom: currentTile.zoom, x: currentTile.x + 1, y: currentTile.y };
        //         const leftTile = { zoom: currentTile.zoom, x: currentTile.x - 1, y: currentTile.y };
        //         const aboveTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y - 1 };
        //         const belowTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y + 1 };

        //         const neighbours = [rightTile, leftTile, aboveTile, belowTile];

        //         neighbours.forEach((neighbour) => {
        //             if (!tileCandidates.has(JSON.stringify(neighbour))) {
        //                 tileCandidates.set(JSON.stringify(neighbour), neighbour);
        //             }
        //         });
        //     }

        // } else {
        //     // Hardcoded on first AvailableTileSource
        //     const zoomlevel = this.catalog.availablePublicTransportTilesConfigs[0].onelevelzoom;

        //     const fromLocation: ILocation = this.query.from[0];
        //     const toLocation: ILocation = this.query.to[0];

        //     // Known bug: starttile or endtile are not available -> should calculate nearest tile (only edge case)
        //     const startTile = {
        //         zoom: zoomlevel,
        //         x: Slippy.lonToTile(fromLocation.longitude, zoomlevel),
        //         y: Slippy.latToTile(fromLocation.latitude, zoomlevel),
        //     };

        //     const endTile = {
        //         zoom: zoomlevel,
        //         x: Slippy.lonToTile(toLocation.longitude, zoomlevel),
        //         y: Slippy.latToTile(toLocation.latitude, zoomlevel),
        //     };

        //     // Build initial set of tileCandidates; Line based like in the lineQueryIterator
        //     tileCandidates = new Map([[JSON.stringify(startTile), startTile]]);

        //     let currentTile = startTile;
        //     while (JSON.stringify(currentTile) !== JSON.stringify(endTile)) {
        //         const rightTile = { zoom: currentTile.zoom, x: currentTile.x + 1, y: currentTile.y };
        //         const leftTile = { zoom: currentTile.zoom, x: currentTile.x - 1, y: currentTile.y };
        //         const aboveTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y - 1 };
        //         const belowTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y + 1 };

        //         const neighbours = [rightTile, leftTile, aboveTile, belowTile];

        //         const line = {
        //             x1: fromLocation.longitude,
        //             y1: fromLocation.latitude,
        //             x2: toLocation.longitude,
        //             y2: toLocation.latitude,
        //         };

        //         neighbours.forEach((neighbour) => {
        //             if (Slippy.intersects(neighbour, line)) {
        //                 if (!tileCandidates.has(JSON.stringify(neighbour))) {
        //                     tileCandidates.set(JSON.stringify(neighbour), neighbour);
        //                     currentTile = neighbour;
        //                 }
        //             }
        //         });
        //     }
        // }

        // // Save the set of tiles in the state
        // this.tileCandidatesPrevious = tileCandidates;

        // // Set of tiles that will actually be fetched
        // const tilesToFetch = new Set<IPublicTransportTile>();
        // const self = this;

        // const availableTilesPromises = [];

        // // Tiles may not actually exist -> filter these
        // for (const value of tileCandidates.values()) {
        //     // Hardcoded on first connectionsource
        //     let accessUrl = this.catalog.connectionsSourceConfigs[0].accessUrl;
        //     accessUrl = accessUrl.replace("{zoom}", value.zoom.toString());
        //     accessUrl = accessUrl.replace("{x}", value.x.toString());
        //     accessUrl = accessUrl.replace("{y}", value.y.toString());

        //     const tilePromise = this.availablePublicTransportTilesProvider.getPublicTransportTileById(accessUrl)
        //         .then((tile) => {
        //             if (tile) {
        //                 tilesToFetch.add(tile);
        //             }
        //         });
        //     availableTilesPromises.push(tilePromise);
        // }
        // Promise.all(availableTilesPromises).then(() => {
        //     self.value = this.query;
        //     self.value.tilesToFetch = tilesToFetch;
        //     self.readable = true;
        // });

        // return tilesToFetch;
    }
}
