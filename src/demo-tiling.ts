import {
    BasicTrainPlanner, CustomPlanner,
    DelijnNmbsPlanner, TravelMode,
} from ".";
import Catalog from "./Catalog";
import EventBus from "./events/EventBus";
import EventType from "./events/EventType";
import IPath from "./interfaces/IPath";
import Planner from "./planner/configurations/Planner";
import IResolvedQueryTiled from "./planner/public-transport/IResolvedQueryTiled";
import Units from "./util/Units";

import fs = require("fs");
import path = require("path");
import profile_tree from "./configs/custom_tree";
import IQuery from "./interfaces/IQuery";

export default async (logResults: boolean) => {

    // One level
    const catalogNmbsTiledOneLevel = new Catalog();
    catalogNmbsTiledOneLevel.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledOneLevel.addConnectionsSource("http://localhost:3000/nmbs-tiled-onelevel/connections/12/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledOneLevel
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-onelevel/tiles", 12);

    const plannerTiledOnelevel = new CustomPlanner(catalogNmbsTiledOneLevel);

    // Multi level
    const catalogNmbsTiledMultiLevel = new Catalog();
    catalogNmbsTiledMultiLevel.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledMultiLevel.addConnectionsSource("http://localhost:3000/nmbs-tiled-multilevel/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledMultiLevel
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-multilevel/tiles");

    const plannerTiledMultilevel = new CustomPlanner(catalogNmbsTiledMultiLevel);

    // One level tree
    const catalogNmbsTiledOneLevelTree = new Catalog();
    catalogNmbsTiledOneLevelTree.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledOneLevelTree.addConnectionsSource("http://localhost:3000/nmbs-tiled-onelevel-tree/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledOneLevelTree
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-onelevel-tree/connections");

    const plannerTiledOnelevelTree = new CustomPlanner(catalogNmbsTiledOneLevelTree, profile_tree);

    // Multi level tree
    const catalogNmbsTiledMultiLevelTree = new Catalog();
    catalogNmbsTiledMultiLevelTree.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledMultiLevelTree.addConnectionsSource("http://localhost:3000/nmbs-tiled-multilevel-tree/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledMultiLevelTree
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-multilevel-tree/connections");

    const plannerTiledMultilevelTree = new CustomPlanner(catalogNmbsTiledMultiLevelTree, profile_tree);

    // Baseline
    const baseLinePlanner = new DelijnNmbsPlanner(); // Delijn removed from catalog

    if (logResults) {
        let scannedPages = 0;
        let scannedPagesSize = 0;
        let scannedConnections = 0;

        const eventBus = EventBus.getInstance();

        const logFetch = true; // Log urls

        if (logResults) {
            console.log(`${new Date()} Start prefetch`);
        }

        eventBus
            .on(EventType.InvalidQuery, (error) => {
                console.log("InvalidQuery", error);
            })
            .on(EventType.AbortQuery, (reason) => {
                console.log("AbortQuery", reason);
            })
            .on(EventType.Query, (Query) => {
                console.log("Query", Query);
            })
            .on(EventType.TiledQuery, (query: IResolvedQueryTiled) => {
                const numberOfTiles = query.tilesToFetch.size;
                console.log("Total scanned tiles", numberOfTiles);
                console.log("Total scanned pages", scannedPages);
                console.log("Total scanned pages size", Math.floor(scannedPagesSize / 1024));
                scannedPages = 0;
                scannedPagesSize = 0;
            })
            .on(EventType.SubQuery, (query) => {
                const { minimumDepartureTime, maximumArrivalTime } = query;

                console.log("Total scanned pages", scannedPages);
                console.log("Total scanned connections", scannedConnections);
                console.log("[Subquery]", minimumDepartureTime, maximumArrivalTime,
                    maximumArrivalTime - minimumDepartureTime);
            })
            .on(EventType.LDFetchGet, (url: string, duration, size?: number) => {
                if (url.includes("connections")) {
                    scannedPages++;
                    if (size) {
                        scannedPagesSize += size;
                    }
                }

                if (logFetch) {
                    console.log(`[GET] ${url} (${duration}ms)`);
                }
            })
            .on(EventType.ConnectionScan, (connection) => {
                scannedConnections++;
            })
            .on(EventType.Warning, (e) => {
                console.warn(e);
            });
    }

    if (logResults) {
        console.log(`${new Date()} Start query`);
    }

    const queries: IQuery[] = await readQueries("/home/jflipts/Documents/queries-nmbs", 3, new Date(2019, 11, 1, 12));

    const metricsBaseline = [];
    const metricsStraightLineOneLevel = [];
    const metricsStraightLineMultiLevel = [];
    const metricsExpandingOneLevel = [];
    const metricsTreeOneLevel = [];
    const metricsTreeMultiLevel = [];

    for (const query of queries) {
        // Base case
        await executeQuery(baseLinePlanner, query)
            .then((queryMetrics) => {
                metricsBaseline.push(queryMetrics);
            });

        // Straight line + One level
        query.tilesFetchStrategy = "straight-line";
        await executeQuery(plannerTiledOnelevel, query)
            .then((queryMetrics) => {
                metricsStraightLineOneLevel.push(queryMetrics);
            });

        // Straight line + Multi level
        query.tilesFetchStrategy = "straight-line";
        await executeQuery(plannerTiledMultilevel, query)
            .then((queryMetrics) => {
                metricsStraightLineMultiLevel.push(queryMetrics);
            });

        // Expanding + One level
        query.tilesFetchStrategy = "expanding";
        await executeQuery(plannerTiledOnelevel, query)
            .then((queryMetrics) => {
                metricsExpandingOneLevel.push(queryMetrics);
            });

        // Tree + One level
        query.tilesFetchStrategy = "tree";
        await executeQuery(plannerTiledOnelevelTree, query)
            .then((queryMetrics) => {
                metricsTreeOneLevel.push(queryMetrics);
            });

        // Tree + Multi level
        query.tilesFetchStrategy = "tree";
        await executeQuery(plannerTiledMultilevelTree, query)
            .then((queryMetrics) => {
                metricsTreeMultiLevel.push(queryMetrics);
            });

    }

    const amount = 2;

    plannerTiledOnelevel
        .setProfileID("https://hdelva.be/profile/pedestrian")
        .query({
            // roadNetworkOnly: true,
            // from: "https://data.delijn.be/stops/201657",
            // to: "https://data.delijn.be/stops/205910",
            // from: "https://data.delijn.be/stops/200455", // Deinze weg op Grammene +456
            // to: "https://data.delijn.be/stops/502481", // Tielt Metaalconstructie Goossens
            // from: "https://data.delijn.be/stops/509927", // Tield Rameplein perron 1
            // to: "https://data.delijn.be/stops/200455", // Deinze weg op Grammene +456
            // from: "Ingelmunster", // Ingelmunster
            // to: "http://irail.be/stations/NMBS/008892007", // Ghent-Sint-Pieters
            // from: { latitude: 50.93278, longitude: 5.32665 }, // Pita Aladin, Hasselt
            // to: { latitude: 50.7980187, longitude: 3.1877779 }, // Burger Pita Pasta, Menen
            // from: "Hasselt",
            // to: "Kortrijk",
            // from: "https://data.nmbs.be/stops/8894755",
            // to: "https://data.nmbs.be/stops/8894748",

            // Case: 1 connection; start and end inside same tile (12/64/1389)
            // from: "http://irail.be/stations/NMBS/008865110",
            // to: "http://irail.be/stations/NMBS/008865128",

            // Case: 1 connection; start and end tile with 2 nonexisting tiles in between
            // from: "Brugge", // (12/2084/1367)
            // to: "http://irail.be/stations/NMBS/008891702", // Oostende (12/2081/1367)

            // Case: 1 connection; 3 adjacent tiles
            // from: "Brugge", // (12/2084/1367)
            // to: "Oostkamp", // (12/2085/1368)

            // Case: 1 or 2 connections; lot of adjacent tiles that are not needed
            // from: "Brugge",
            // to: "http://irail.be/stations/NMBS/008892007", // Ghent-Sint-Pieters

            // Case: 5 or 6 connections; not on a straight line so correct tiles are not fetched
            from: "Brugge",
            to: "Leuven",

            minimumDepartureTime: new Date(2019, 11, 1), // 1 December 2019...
            maximumTransferDuration: Units.fromMinutes(30),
        })
        .take(amount)
        .on("error", (error) => {
            console.log(error);
        })
        .on("data", (journey: IPath) => {

            if (logResults) {
                console.log(new Date());
                console.log(JSON.stringify(journey, null, " "));
                console.log("\n");
            }
        })
        .on("end", () => {
            console.log(`${new Date()} Finish query`);
        });

};

/* tslint:disable:no-string-literal */

function executeQuery(planner: Planner, query: IQuery) {
    return new Promise((resolve, reject) => {
        let stageNumber = 1;
        let stageScannedPages = 0;
        let stageScannedPagesSize = 0;
        let totalScannedPages = 0;
        let totalScannedPagesSize = 0;
        const queryMetrics = {
            query,
            stages: [],
        };

        // Listeners need to be removed afterwards
        const tiledQueryListener = (resolvedQuery: IResolvedQueryTiled) => {
            const numberOfTiles = resolvedQuery.tilesToFetch.size;
            const stage = {
                stage: stageNumber,
                scannedTiles: numberOfTiles,
                scannedPages: stageScannedPages,
                scannedPagesSize: stageScannedPagesSize / 1024,
            };
            queryMetrics.stages.push(stage);

            stageScannedPages = 0;
            stageScannedPagesSize = 0;

            // This is a workaround as "end" is not called on the Iterator.
            // This should be equal to the number of times the Planner is run per query
            if ((stageNumber === 5 && query.tilesFetchStrategy === "expanding") ||
                query.tilesFetchStrategy === "straight-line" ||
                query.tilesFetchStrategy === "tree") {

                queryMetrics["totalDuration"] = (new Date().getTime() - t0) / 1000;
                queryMetrics["totalScannedPages"] = totalScannedPages;
                queryMetrics["totalScannedPagesSize"] = totalScannedPagesSize / 1024;

                EventBus.getInstance().removeListener(EventType.TiledQuery, tiledQueryListener);
                EventBus.getInstance().removeListener(EventType.LDFetchGet, LDFetchGetListener);
                resolve(queryMetrics);
            }

            stageNumber++;
        };

        const LDFetchGetListener = (url: string, duration, size?: number) => {
            if (url.includes("connections")) {
                stageScannedPages++;
                totalScannedPages++;

                if (size) {
                    stageScannedPagesSize += +size;
                    totalScannedPagesSize += +size;
                }
            }
            if (url.includes("tiles") && size) {
                queryMetrics["tiles"] = size / 1024;
            }
        };

        EventBus.getInstance()
            .on(EventType.TiledQuery, tiledQueryListener)
            .on(EventType.LDFetchGet, LDFetchGetListener);

        const t0 = new Date().getTime();
        planner
            .setProfileID("https://hdelva.be/profile/pedestrian")
            .query(query)
            .on("data", (journey: IPath) => {
                if (!queryMetrics["earliestArrivalTime"]) {
                    queryMetrics["firstResultDuration"] = (new Date().getTime() - t0) / 1000;
                }

                const arrivalTime = journey.getArrivalTime(query);
                if (!queryMetrics["earliestArrivalTime"] || arrivalTime < queryMetrics["earliestArrivalTime"]) {
                    queryMetrics["earliestArrivalTime"] = arrivalTime;
                }

                if (true) {
                    console.log(new Date());
                    console.log(JSON.stringify(journey, null, " "));
                    console.log("\n");
                }
            })
            .on("end", () => { // Gets called on CSAEarliestArrival
                queryMetrics["totalDuration"] = (new Date().getTime() - t0) / 1000;
                queryMetrics["totalScannedPages"] = totalScannedPages;
                queryMetrics["totalScannedPagesSize"] = totalScannedPagesSize / 1024;

                EventBus.getInstance().removeListener(EventType.TiledQuery, tiledQueryListener);
                EventBus.getInstance().removeListener(EventType.LDFetchGet, LDFetchGetListener);
                resolve(queryMetrics);
            })
            .on("error", (error) => {
                console.log(error);
            });
    });
}

/**
 * Read a number of queries from a folder
 *
 * @param folderPath
 * @param amount
 * @param dateOfQueries
 */
async function readQueries(folderPath: string, amount: number, dateOfQueries: Date = new Date()) {
    const fileNames = fs.readdirSync(folderPath);

    const queries: IQuery[] = [];

    for (let i = 0; queries.length < amount; i = i + 97) {
        const buffer = await fs.promises.readFile(path.join(folderPath, fileNames[i % fileNames.length]));

        const query = JSON.parse(buffer.toString()).query;

        const queryDate = new Date(query["query_time"]);
        queryDate.setFullYear(dateOfQueries.getFullYear());
        queryDate.setMonth(dateOfQueries.getMonth());
        queryDate.setDate(dateOfQueries.getDate());
        queryDate.setHours(dateOfQueries.getHours());

        const queryTemplate = {
            from: query["departure_stop"],
            to: query["arrival_stop"],
            minimumDepartureTime: queryDate,
            maximumTransferDuration: Units.fromMinutes(30),
        };

        queries.push(queryTemplate);
    }

    return queries;
}
/* tslint:enable:no-string-literal */
