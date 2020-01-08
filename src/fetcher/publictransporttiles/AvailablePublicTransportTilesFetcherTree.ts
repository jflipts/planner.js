import { injectable } from "inversify";
import parse from "wellknown";
import { EventType } from "../..";
import EventBus from "../../events/EventBus";
import ILocation from "../../interfaces/ILocation";
import Slippy from "../../planner/public-transport/tiles/Slippy";
import IResolvedQuery from "../../query-runner/IResolvedQuery";
import IPublicTransportTile from "./IPublicTransportTile";
import IPublicTransportTilesFetcher from "./IPublicTransportTilesFetcher";

interface IPublicTransportTileMap {
    [stopId: string]: IPublicTransportTile;
}

interface IInternalNode extends IPublicTransportTile {
    children?: Array<(IInternalNode | IPublicTransportTile)>;
    parent?: IInternalNode;
    unprocessedChildren?: IUnprocessedChildNode[];
}

function instanceOfIInternalNode(object: IPublicTransportTile): object is IInternalNode {
    return ("children" in object || "unprocessedChildren" in object);
}

interface IWkt {
    TL: ILocation;
    TR: ILocation;
    BR: ILocation;
    BL: ILocation;
}

interface IUnprocessedChildNode {
    id: string;
    path: string;
    wkt: IWkt;
}

@injectable()
// tslint:disable: no-string-literal
export default class AvailablePublicTransportTilesFetcherTree implements IPublicTransportTilesFetcher {

    private accessUrl: string;

    private loadPromise: Promise<any>;
    private tiles: IPublicTransportTileMap = {};
    private rootNode: IPublicTransportTile;

    public setAccessUrl(accessUrl: string) {
        this.accessUrl = accessUrl;
    }

    public prefetchAvailableTiles(): void {
        this.ensureRootLoaded();
    }

    public async getPublicTransportTileById(tileId: string): Promise<IPublicTransportTile> {
        throw new Error("Method not implemented.");
    }

    public async getAllAvailableTiles(): Promise<IPublicTransportTile[]> {
        throw new Error("Method not implemented.");
    }

    /**
     * Get all the tiles that intersect with a line
     * @param line
     */
    public async getAllTilesIntersectingWithLine(
        line: { x1: number, y1: number, x2: number, y2: number },
        query: IResolvedQuery,
    ): Promise<IPublicTransportTile[]> {

        let tiles: IPublicTransportTile[] = [];

        await this.ensureRootLoaded();

        if (instanceOfIInternalNode(this.rootNode)) {
            tiles = tiles.concat(await this.proccessChild(this.rootNode, line, query));
        } else if (Slippy.intersects(this.rootNode, line)) {
            tiles.push(this.rootNode);
        }

        return tiles;
    }

    /**
     * Recursive function to get all the children that intersect with a line
     */
    private async proccessChild(
        node: IInternalNode,
        line: { x1: number, y1: number, x2: number, y2: number },
        query: IResolvedQuery,
    ): Promise<IPublicTransportTile[]> {

        let tiles: IPublicTransportTile[] = [];

        // Fetched nodes
        for (const child of node.children) {
            if (Slippy.intersects(child, line)) {
                if (instanceOfIInternalNode(child)) { // Internal nodes
                    tiles = tiles.concat(await this.proccessChild(child, line, query));
                } else { // Leaves
                    tiles.push(child);
                }
            }
        }

        // Not fetched nodes
        const remainingUnprocessedChildren: IUnprocessedChildNode[] = [];
        for (const child of node.unprocessedChildren) {
            if (Slippy.intersectAabbRay(child.wkt, line)) {
                const tile = await this.getByUrl(
                    child.id + "?departureTime=" + query.minimumDepartureTime.toISOString(),
                );
                if (instanceOfIInternalNode(tile)) { // Internal nodes
                    tiles = tiles.concat(await this.proccessChild(tile, line, query));
                } else { // Leaves
                    tiles.push(tile);
                }
                node.children.push(tile);
            } else {
                remainingUnprocessedChildren.push(child);
            }
        }
        node.unprocessedChildren = remainingUnprocessedChildren;

        return tiles;
    }

    private async ensureRootLoaded() {
        if (!this.loadPromise && !this.rootNode) {
            this.loadRootNode();
        }

        if (this.loadPromise) {
            await this.loadPromise;
        }
    }

    private loadRootNode() {
        this.loadPromise = this.getByUrl(this.accessUrl)
            .then((rootNode) => {
                this.rootNode = rootNode;
                this.loadPromise = null;
            })
            .catch((reason) => {
                console.log(reason);
            });
    }

    private async getByUrl(url: string): Promise<IPublicTransportTile> {
        const beginTime = new Date();

        const response = await fetch(url);
        const responseText = await response.text();

        if (response.status !== 200) {
            EventBus.getInstance().emit(EventType.Warning, `${url} responded with status code ${response.status}`);
        }

        if (response.status === 200 && responseText) {
            const blob = JSON.parse(responseText);

            const id = blob["@id"].split("?")[0];
            const node: IInternalNode = {
                id,
                zoom: blob["tiles:zoom"],
                x: blob["tiles:longitudeTile"],
                y: blob["tiles:latitudeTile"],
            };

            if (blob["tree:relation"]) {
                node.children = [];
                node.unprocessedChildren = [];

                for (const relation of blob["tree:relation"]) {
                    if (relation["@type"] !== "tree:GeospatiallyContainsRelation") {
                        EventBus.getInstance().emit(EventType.Warning,
                            `${url} has unreadable tree:relation ${relation["@type"]}`);
                    } else {

                        const value: string = relation["tree:value"];
                        const coordinates = parse(value).coordinates[0]; // Only works for the first Polygon
                        const locations = coordinates.map((pair: number[]) => {
                            const rObj: ILocation = {};
                            rObj.longitude = pair[0];
                            rObj.latitude = pair[1];
                            return rObj;
                        });
                        // Implicit assumption that we are dealing with AABB
                        const wkt: IWkt = {
                            TL: locations[0],
                            TR: locations[1],
                            BR: locations[2],
                            BL: locations[3],
                        };

                        const child: IUnprocessedChildNode = {
                            id: relation["tree:node"]["@id"],
                            path: relation["tree:path"],
                            wkt,
                        };

                        node.unprocessedChildren.push(child);
                    }
                }
            }

            this.tiles[node.id] = node;
            const duration = (new Date()).getTime() - beginTime.getTime();
            if (node.children) {
                EventBus.getInstance().emit(
                    EventType.LDFetchGet,
                    url,
                    duration,
                    +response.headers.get("Content-Length"),
                    "internal-node",
                );
            } else {
                EventBus.getInstance()
                    .emit(EventType.LDFetchGet, url, duration, +response.headers.get("Content-Length"), "leaf");
            }

            return this.tiles[node.id];
        }

        return undefined;
    }
}
