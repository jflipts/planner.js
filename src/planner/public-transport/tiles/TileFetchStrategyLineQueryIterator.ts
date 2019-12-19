import { AsyncIterator } from "asynciterator";
import { inject, injectable } from "inversify";
import IPublicTransportTile from "../../../fetcher/publictransporttiles/IPublicTransportTile";
import IPublicTransportTilesProvider from "../../../fetcher/publictransporttiles/IPublicTransportTilesProvider";
import ILocation from "../../../interfaces/ILocation";
import IResolvedQuery from "../../../query-runner/IResolvedQuery";
import TYPES from "../../../types";
import Slippy from "./Slippy";

interface IResolvedQueryTiled extends IResolvedQuery {
    tilesToFetch: Set<IPublicTransportTile>;
}

// @injectable()
export default class TileFetchStrategyLineQueryIterator extends AsyncIterator<IResolvedQueryTiled> {

    protected readonly availablePublicTransportTilesProvider: IPublicTransportTilesProvider;
    protected readonly query;

    private value: IResolvedQueryTiled;
    private waitingOnTiles;
    private hasReturned: boolean = false;

    constructor(
        @inject(TYPES.PublicTransportTilesProvider)
        availablePublicTransportTilesProvider: IPublicTransportTilesProvider,
        query: IResolvedQuery,
    ) {
        super();

        this.availablePublicTransportTilesProvider = availablePublicTransportTilesProvider;
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

        // TODO Should become catalog variable or based on availableTilesProvider
        const zoomlevel = 12;

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

            // AABB - line segment intersection test
            function intersects(tile: { x, y, zoom }, line: { x1, y1, x2, y2 }): boolean {
                const bbox = Slippy.getBBox(tile.x, tile.y, tile.zoom);

                let above = 0;
                bbox.forEach((element) => {
                    const f = (line.y2 - line.y1) * element.longitude
                        + (line.x1 - line.x2) * element.latitude
                        + (line.x2 * line.y1 - line.x1 * line.y2);
                    if (f === 0) {
                        return true;
                    } else if (f > 0) {
                        above += 1;
                    } else {
                        above -= 1;
                    }
                });

                if (above === 4 || above === -4) {
                    return false;
                } else {
                    const BL = bbox[1];
                    const TR = bbox[2];

                    if (
                        (line.x1 > TR.longitude && line.x2 > TR.longitude) ||
                        (line.x1 < BL.longitude && line.x2 < BL.longitude) ||
                        (line.y1 > TR.latitude && line.y2 > TR.latitude) ||
                        (line.y1 < BL.latitude && line.y2 < BL.latitude)
                    ) {
                        return false;
                    }
                }
                return true;
            }

            const line = {
                x1: fromLocation.longitude,
                y1: fromLocation.latitude,
                x2: toLocation.longitude,
                y2: toLocation.latitude,
            };

            neighbours.forEach((neighbour) => {
                if (intersects(neighbour, line)) {
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

        this.waitingOnTiles = 0;

        // Tiles may not actually exist -> filter these
        for (const value of tileCandidates.values()) {
            // Hardcoded on first connectionsource
            let accessUrl  = "http://localhost:3000/nmbs-tiled/connections/12/{x}/{y}";
            accessUrl = accessUrl.replace("{zoom}", value.zoom.toString());
            accessUrl = accessUrl.replace("{x}", value.x.toString());
            accessUrl = accessUrl.replace("{y}", value.y.toString());

            this.waitingOnTiles++;

            this.availablePublicTransportTilesProvider.getPublicTransportTileById(accessUrl)
                .then((tile) => {
                    if (tile) {
                        tilesToFetch.add(tile);
                    }
                    if (--this.waitingOnTiles === 0) {
                        self.value = this.query;
                        self.value.tilesToFetch = tilesToFetch;
                        self.readable = true;
                    }
                });
        }

        return tilesToFetch;
    }
}
