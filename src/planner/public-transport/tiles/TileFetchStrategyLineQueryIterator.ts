import { AsyncIterator } from "asynciterator";
import { inject, injectable } from "inversify";
import Catalog from "../../../Catalog";
import IPublicTransportTile from "../../../fetcher/publictransporttiles/IPublicTransportTile";
import IPublicTransportTilesProvider from "../../../fetcher/publictransporttiles/IPublicTransportTilesProvider";
import ILocation from "../../../interfaces/ILocation";
import IResolvedQuery from "../../../query-runner/IResolvedQuery";
import TYPES from "../../../types";
import IResolvedQueryTiled from "../IResolvedQueryTiled";
import Slippy from "./Slippy";

// @injectable()
export default class TileFetchStrategyLineQueryIterator extends AsyncIterator<IResolvedQueryTiled> {

    protected readonly availablePublicTransportTilesProvider: IPublicTransportTilesProvider;
    protected readonly catalog: Catalog;
    protected readonly query;

    private value: IResolvedQueryTiled;
    private hasReturned: boolean = false;

    constructor(
        @inject(TYPES.PublicTransportTilesProvider)
        availablePublicTransportTilesProvider: IPublicTransportTilesProvider,
        @inject(TYPES.Catalog) catalog: Catalog,
        query: IResolvedQuery,
    ) {
        super();

        this.availablePublicTransportTilesProvider = availablePublicTransportTilesProvider;
        this.catalog = catalog;
        this.query = query;

        this.availablePublicTransportTilesProvider.prefetchAvailableTiles();
    }

    public read(): IResolvedQueryTiled {
        if (this.closed) {
            return null;
        }

        if (this.hasReturned) {
            this.close();
            return null;
        }

        if (this.value) {
            // This iterator should only return once
            this.readable = false;
            this.hasReturned = true;

            return this.value;
        } else {
            this.readable = false;
            this.runQuery();

            return undefined;
        }
    }

    private async runQuery() {

        // Hardcoded on first AvailableTileSource
        const zoomlevel = this.catalog.availablePublicTransportTilesConfigs[0].onelevelzoom;

        const fromLocation: ILocation = this.query.from[0];
        const toLocation: ILocation = this.query.to[0];

        // Known bug: starttile or endtile are not available -> should calculate nearest tile (only edge case)
        const startTile = {
            zoom: zoomlevel,
            x: Slippy.lonToTile(fromLocation.longitude, zoomlevel),
            y: Slippy.latToTile(fromLocation.latitude, zoomlevel),
        };

        const endTile = {
            zoom: zoomlevel,
            x: Slippy.lonToTile(toLocation.longitude, zoomlevel),
            y: Slippy.latToTile(toLocation.latitude, zoomlevel),
        };

        // Keep track of all the tiles that could possibly be fetched
        const tileCandidates = new Map([[JSON.stringify(startTile), startTile]]);

        let currentTile = startTile;
        while (JSON.stringify(currentTile) !== JSON.stringify(endTile)) {
            const rightTile = { zoom: currentTile.zoom, x: currentTile.x + 1, y: currentTile.y };
            const leftTile = { zoom: currentTile.zoom, x: currentTile.x - 1, y: currentTile.y };
            const aboveTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y - 1 };
            const belowTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y + 1 };

            const neighbours = [rightTile, leftTile, aboveTile, belowTile];

            const line = {
                x1: fromLocation.longitude,
                y1: fromLocation.latitude,
                x2: toLocation.longitude,
                y2: toLocation.latitude,
            };

            neighbours.forEach((neighbour) => {
                if (Slippy.intersects(neighbour, line)) {
                    if (!tileCandidates.has(JSON.stringify(neighbour))) {
                        tileCandidates.set(JSON.stringify(neighbour), neighbour);
                        currentTile = neighbour;
                    }
                }
            });
        }

        // Set of tiles that will actually be fetched
        const tilesToFetch = new Set<IPublicTransportTile>();
        const self = this;

        const availableTilesPromises = [];

        // Tiles may not actually exist -> filter these
        for (const value of tileCandidates.values()) {
            // Hardcoded on first connectionsource
            let accessUrl = this.catalog.connectionsSourceConfigs[0].accessUrl;
            accessUrl = accessUrl.replace("{zoom}", value.zoom.toString());
            accessUrl = accessUrl.replace("{x}", value.x.toString());
            accessUrl = accessUrl.replace("{y}", value.y.toString());

            const tilePromise = this.availablePublicTransportTilesProvider.getPublicTransportTileById(accessUrl)
                .then((tile) => {
                    if (tile) {
                        tilesToFetch.add(tile);
                    }
                });
            availableTilesPromises.push(tilePromise);
        }
        Promise.all(availableTilesPromises).then(() => {
            self.value = this.query;
            self.value.tilesToFetch = tilesToFetch;
            self.readable = true;
        });

        return tilesToFetch;
    }
}
