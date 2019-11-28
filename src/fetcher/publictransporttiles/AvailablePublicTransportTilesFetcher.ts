import { injectable } from "inversify";
import { EventType } from "../..";
import EventBus from "../../events/EventBus";
import IPublicTransportTile from "./IPublicTransportTile";
import IPublicTransportTilesFetcher from "./IPublicTransportTilesFetcher";

interface IPublicTransportTileMap {
    [stopId: string]: IPublicTransportTile;
}

@injectable()
// tslint:disable: no-string-literal
export default class AvailablePublicTransportTilesFetcher implements IPublicTransportTilesFetcher {

    private accessUrl: string;

    private loadPromise: Promise<any>;
    private tiles: IPublicTransportTileMap;

    constructor() {
    }

    public setAccessUrl(accessUrl: string) {
        this.accessUrl = accessUrl;
    }

    public prefetchAvailableTiles(): void {
        this.ensureTilesLoaded();
    }

    public async getPublicTransportTileById(tileId: string): Promise<IPublicTransportTile> {
        await this.ensureTilesLoaded();

        return this.tiles[tileId];
    }

    public async getAllAvailableTiles(): Promise<IPublicTransportTile[]> {
        await this.ensureTilesLoaded();

        return Object.values(this.tiles);
    }

    private async ensureTilesLoaded() {
        if (!this.loadPromise && !this.tiles) {
            this.loadTiles();
        }

        if (this.loadPromise) {
            await this.loadPromise;
        }
    }

    private loadTiles() {
        this.loadPromise = this.getByUrl(this.accessUrl)
            .then((tiles) => {
                this.tiles = tiles;
                this.loadPromise = null;
            })
            .catch((reason) => {
                console.log(reason);
            });
    }

    private async getByUrl(url: string): Promise<IPublicTransportTileMap> {
        const beginTime = new Date();

        const response = await fetch(url);
        const responseText = await response.text();

        const tiles: IPublicTransportTileMap = {};

        if (response.status !== 200) {
            EventBus.getInstance().emit(EventType.Warning, `${url} responded with status code ${response.status}`);
        }

        if (response.status === 200 && responseText) {
            const blob = JSON.parse(responseText);

            for (const entity of blob["@graph"]) {
                const id = entity["@id"];
                const zoom = entity["tiles:zoom"];
                const longitudeTile = entity["tiles:longitudeTile"];
                const latitudeTile = entity["tiles:latitudeTile"];

                const tile: IPublicTransportTile = {
                    id: id,
                    zoom: zoom,
                    x: longitudeTile,
                    y: latitudeTile,
                }
                tiles[id] = tile;
            }
        }

        const duration = (new Date()).getTime() - beginTime.getTime();
        EventBus.getInstance().emit(EventType.LDFetchGet, url, duration);

        return tiles;
    }
}
