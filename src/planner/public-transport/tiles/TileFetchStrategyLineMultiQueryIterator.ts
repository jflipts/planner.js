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

/**
 * Tile generator that outputs a single set of tiles.
 *
 * Works on One-level and Multi-level tiling.
 * Internally loops over all available tiles by doing static discovery through the /tiles endpoint.
 */
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

        const fromLocation: ILocation = this.query.from[0];
        const toLocation: ILocation = this.query.to[0];

        const line = {
            x1: fromLocation.longitude,
            y1: fromLocation.latitude,
            x2: toLocation.longitude,
            y2: toLocation.latitude,
        };

        const tilesToFetch = new Set<IPublicTransportTile>();

        this.availablePublicTransportTilesProvider.getAllAvailableTiles()
            .then((availableTiles) => {
                availableTiles.forEach((availableTile) => {
                    if (availableTile && Slippy.intersects(availableTile, line)) {
                        tilesToFetch.add(availableTile);
                    }
                });

                this.value = this.query;
                this.value.tilesToFetch = tilesToFetch;
                this.readable = true;
            });
        }

}
