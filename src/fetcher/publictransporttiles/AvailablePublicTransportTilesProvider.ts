import { inject, injectable } from "inversify";
import Catalog from "../../Catalog";
import TYPES, { PublicTransportTilesFetcherFactory } from "../../types";
import IPublicTransportTile from "./IPublicTransportTile";
import IPublicTransportTilesFetcher from "./IPublicTransportTilesFetcher";
import IPublicTransportTilesProvider from "./IPublicTransportTilesProvider";

@injectable()
export default class AvailablePublicTransportTilesProvider implements IPublicTransportTilesProvider {

  private readonly fetchers: IPublicTransportTilesFetcher[];
  private cachedTiles: IPublicTransportTile[];

  constructor(
    @inject(TYPES.PublicTransportTilesFetcherFactory) factory: PublicTransportTilesFetcherFactory,
    @inject(TYPES.Catalog) catalog: Catalog,
  ) {
    this.fetchers = [];
    this.cachedTiles = [];

    for (const { accessUrl } of catalog.availablePublicTransportTilesConfigs) {
      this.fetchers.push(factory(accessUrl));
    }
  }

  public prefetchAvailableTiles(): void {
    for (const fetcher of this.fetchers) {
        fetcher.prefetchAvailableTiles();
    }
  }

  public async getPublicTransportTileById(id: string): Promise<IPublicTransportTile> {
    return Promise.all(this.fetchers
      .map((fetcher: IPublicTransportTilesFetcher) => fetcher.getPublicTransportTileById(id)),
    ).then((results: IPublicTransportTile[]) => results.find((tile) => tile !== undefined));
  }

  public async getAllAvailableTiles(): Promise<IPublicTransportTile[]> {
    if (this.cachedTiles.length > 0) {
      return Promise.resolve(this.cachedTiles);
    }

    return Promise.all(this.fetchers
      .map((fetcher: IPublicTransportTilesFetcher) => fetcher.getAllAvailableTiles()),
    ).then((results: IPublicTransportTile[][]) => {
      this.cachedTiles = [].concat(...results);

      return this.cachedTiles;
    });
  }
}
