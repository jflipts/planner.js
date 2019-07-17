import concaveman = require("concaveman");
import { Delaunay } from "d3-delaunay";
import { RoutableTileNode } from "../../entities/tiles/node";
import RoutableTileRegistry from "../../entities/tiles/registry";
import ILocation from "../../interfaces/ILocation";
import { IPathTree } from "../../pathfinding/pathfinder";
import ILocationResolver from "../../query-runner/ILocationResolver";
import Geo from "../../util/Geo";
import UnionFind from "../../util/UnionFind";
import { pointsOfTriangle } from "./util";

// we make extensive use of the Delaunator library which uses indexes for everything
// we'll need this to get the corresponding RoutableTileNode for a given index
type NodeList = RoutableTileNode[];

// a list of boolean values, indicating whether or not the node with a given index has a specific label
type NodeLabelList = boolean[];

// A cluster of routable tile nodes
type NodeCluster = Set<number>;

// A ring is a list of connected geographical points.
type Ring = ILocation[];

// A polygon is represented as a list of rings.
// The first being the outer ring, the others being holes.
type Polygon = Ring[];

export async function visualizeConcaveIsochrone(
    locationResolver: ILocationResolver,
    pathTree: IPathTree,
    maxCost: number,
) {
    const nodes = [];
    const costs = {};
    for (const [id, branch] of Object.entries(pathTree)) {
        const { duration } = branch;
        const node = await locationResolver.resolve(id);
        if (node && duration !== Infinity) {
            nodes.push(node);
            costs[Geo.getId(node)] = duration;
        }
    }

    const internalNodes = nodes
        .filter((node) => costs[node.id] < maxCost)
        .map((n) => [n.longitude, n.latitude]);

    let isochrones = [];
    if (internalNodes.length > 0) {
        const shell = concaveman(internalNodes);
        isochrones = [[shell.map((point) => {
            return { longitude: point[0], latitude: point[1] };
        })]];
    }

    return {
        isochrones,
    };
}

export function visualizeIsochrone(registry: RoutableTileRegistry, pathTree: IPathTree, maxCost: number) {
    /**
     * Isochrones are generated by applying a delaunay triangulisation to the road network nodes,
     * Union-Find (= disjoint set) is used to find clusters of external/internal nodes.
     * Each cluster will form one ring in the isochrone.
     */

    const nodes: NodeList = [];
    const costs = {};
    for (const [id, branch] of Object.entries(pathTree)) {
        const { duration } = branch;
        const node = registry.getNode(id);
        if (node && duration !== Infinity) {
            nodes.push(node);
            costs[node.id] = duration;
        }
    }

    nodes.push({ latitude: 90, longitude: 180, id: "1" });
    nodes.push({ latitude: -90, longitude: 180, id: "2" });
    nodes.push({ latitude: 90, longitude: -180, id: "3" });
    nodes.push({ latitude: -90, longitude: -180, id: "4" });

    costs["1"] = Infinity;
    costs["2"] = Infinity;
    costs["3"] = Infinity;
    costs["4"] = Infinity;

    const delaunay = createTriangulation(nodes);
    const internalNodes: NodeLabelList = nodes.map((node) => costs[node.id] < maxCost);
    const externalNodes: NodeLabelList = internalNodes.map((v) => !v);

    const internalClusters = clusterNodes(nodes, internalNodes, delaunay);
    const externalClusters = clusterNodes(nodes, externalNodes, delaunay);

    const polygons: Polygon[] = internalClusters
        .filter((cluster) => cluster.size > 1)
        .map((internalCluster) =>
            createPolygon(costs, maxCost, nodes, internalCluster, externalClusters, delaunay),
        );

    return {
        isochrones: polygons.filter((p) => p.length > 0),
    };
}

function createTriangulation(nodes: ILocation[]): Delaunay {
    function getX(p: ILocation) {
        return p.longitude;
    }

    function getY(p: ILocation) {
        return p.latitude;
    }

    return Delaunay.from(nodes, getX, getY);
}

function clusterNodes(allNodes: NodeList, relevantNodes: NodeLabelList, delaunay: Delaunay): NodeCluster[] {
    /**
     * Uses Union-Find to cluster the given (relevant) nodes based on the Delaunay triangulisation of all nodes.
     * Returns an array of clusters.
     */
    const forest = new UnionFind(allNodes.length);

    for (const nodeIndex of Array(allNodes.length).keys()) {
        if (relevantNodes[nodeIndex]) {
            const neighbors = delaunay.neighbors(nodeIndex);
            for (const neighbor of neighbors) {
                if (relevantNodes[neighbor]) {
                    forest.union(nodeIndex, neighbor);
                }
            }
        }
    }

    const clusters = forest.getClusters();

    for (const key of Object.keys(clusters)) {
        if (!relevantNodes[key]) {
            delete clusters[key];
        }
    }

    return Object.values(clusters);
}

function createPolygon(
    costs,
    maxCost: number,
    nodes: NodeList,
    internalNodes: NodeCluster,
    externalClusters: NodeCluster[],
    delaunay: Delaunay,
): Polygon {
    /**
     * Creates a polygon for the given cluster of nodes that lie in an isochrone.
     */
    const rings = [];

    // each cluster of external nodes yields a single ring.
    // there's exactly one on the outside of the internal nodes cluster (because union-find)
    // the others will form holes
    for (const externalNodes of externalClusters) {
        const borderLocations: ILocation[] = [];
        const borderNodeIds = new Set();
        for (const nodeIndex of Array(nodes.length).keys()) {
            if (!externalNodes.has(nodeIndex) && internalNodes.has(nodeIndex)) {
                for (const neighbor of delaunay.neighbors(nodeIndex)) {
                    if (externalNodes.has(neighbor)) {
                        const point = pointBetween(nodes[nodeIndex], nodes[neighbor], costs, maxCost);
                        if (point) {
                            borderLocations.push(point);
                        }
                    }
                }
            }
        }

        if (borderLocations.length > 0) {
            const triangulation = createTriangulation(borderLocations);
            const firstNode = triangulation.hull;
            const ring = [borderLocations[firstNode.i]];
            let currentNode = firstNode.next;
            while (currentNode.i !== firstNode.i) {
                ring.push(borderLocations[currentNode.i]);
                currentNode = currentNode.next;
            }
            rings.push(ring);
        }
    }

    // FIXME, the ring with the most nodes might not always be the outer ring
    return rings
        .filter((r) => r.length > 0)
        .sort((a, b) => b.length - a.length);
}

function pointBetween(node1: RoutableTileNode, node2: RoutableTileNode, costs, maxCost): ILocation {
    const nodeCost1 = costs[node1.id];
    const nodeCost2 = costs[node2.id];

    if (nodeCost1 === Infinity && nodeCost2 === Infinity) {
        return null;
    } else if (nodeCost1 === Infinity) {
        return node2;
    } else if (nodeCost2 === Infinity) {
        return node1;
    }

    const costDifference1 = Math.abs(nodeCost1 - maxCost);
    const costDifference2 = Math.abs(nodeCost2 - maxCost);
    const relDifference1 = 1 - costDifference1 / (costDifference1 + costDifference2);
    const relDifference2 = 1 - costDifference2 / (costDifference1 + costDifference2);

    const weight = relDifference1 + relDifference2;
    const latitude = (node1.latitude * relDifference1 + node2.latitude * relDifference2) / weight;
    const longitude = (node1.longitude * relDifference1 + node2.longitude * relDifference2) / weight;

    if (isNaN(latitude) || isNaN(longitude)) {
        return null;
    }

    return { latitude, longitude };
}
