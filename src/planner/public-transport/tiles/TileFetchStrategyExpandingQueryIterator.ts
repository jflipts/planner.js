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

// IResolvedQueryTiled Iterator that returns a larger set of tiles on every read
// Limited to 5 times
// @injectable()
export default class TileFetchStrategyExpandingQueryIterator extends AsyncIterator<IResolvedQueryTiled> {

    protected readonly availablePublicTransportTilesProvider: IPublicTransportTilesProvider;
    protected readonly query;

    // Internal variable keeping track of the next complete query that may be read
    private value: IResolvedQueryTiled;
    // Counter to keep track of number of Tiles that still need to return
    private waitingOnTiles: number;
    // Number of queries that have been read
    private readQueryCounter: number = 0;
    // Previous tile candidates to build further upon
    private tileCandidatesPrevious: Map<string, { zoom: number, x: number, y: number }>;

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

    // TODO: implement locks on value
    public read(): IResolvedQueryTiled {
        if (this.closed) {
            return null;
        }

        // Maximum number of times the Iterator should return a readable value
        if (this.readQueryCounter > 4) {
            this.close();
            return null;
        }

        // Value should be null afterwards
        if (this.value) {
            this.readable = false;
            this.readQueryCounter++;

            const temp = this.value;
            this.value = null;
            this.runQuery();

            return temp;
        } else {
            this.readable = false;
            this.runQuery();

            return undefined;
        }
    }

    private async runQuery() {

        // Keep track of all the tiles that could possibly be fetched
        let tileCandidates: Map<string, { zoom: number, x: number, y: number }>;

        if (this.tileCandidatesPrevious) {
            // Set of old tileCandidates exists; Expand it
            tileCandidates = new Map([...this.tileCandidatesPrevious]);

            for (const currentTile of this.tileCandidatesPrevious.values()) {
                const rightTile = { zoom: currentTile.zoom, x: currentTile.x + 1, y: currentTile.y };
                const leftTile = { zoom: currentTile.zoom, x: currentTile.x - 1, y: currentTile.y };
                const aboveTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y - 1 };
                const belowTile = { zoom: currentTile.zoom, x: currentTile.x, y: currentTile.y + 1 };

                const neighbours = [rightTile, leftTile, aboveTile, belowTile];

                neighbours.forEach((neighbour) => {
                    if (!tileCandidates.has(JSON.stringify(neighbour))) {
                        tileCandidates.set(JSON.stringify(neighbour), neighbour);
                    }
                });
            }

        } else {
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

            // Build initial set of tileCandidates; Line based like in the lineQueryIterator
            tileCandidates = new Map([[JSON.stringify(startTile), startTile]]);

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

            // Save the set of tiles in the state
            this.tileCandidatesPrevious = tileCandidates;
        }

        // Set of tiles that will actually be fetched
        const tilesToFetch = new Set<IPublicTransportTile>();
        const self = this;

        this.waitingOnTiles = 0;

        // Tiles may not actually exist -> filter these
        for (const value of tileCandidates.values()) {
            // Hardcoded on first connectionsource
            let accessUrl = "http://localhost:3000/nmbs-tiled/connections/12/{x}/{y}";
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
