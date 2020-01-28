import ObjectsToCSV from "objects-to-csv";
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

import fs from "fs";
import path = require("path");
import profile_tree from "./configs/custom_tree";
import IQuery from "./interfaces/IQuery";

// Sizes in Bytes, durations in seconds
interface IResultMetics {
    query: IQuery;
    firstEarliestArrivalTime?: Date;
    bestEarliestArrivalTime?: Date;
    firstResultDuration?: number;
    bestResultDuration?: number;

    totalDuration: number;
    totalSize: number;
    totalScannedPages: number;
    totalScannedPagesSize: number;

    totalScannedTiles?: number;
    totalScannedInternalNodes?: number;
    totalScannedInternalNodesSize?: number;

    stages?: IStageMetrics[];
}

interface IStageMetrics {
    stage: number;
    duration: number;
    scannedTiles: number;
    scannedPages: number;
    scannedPagesSize: number;

    earliestArrivalTime?: Date;
    scannedInternalNodes?: number;
    scannedInternalNodesSize?: number;
}

export default async (logResults: boolean) => {

    // One level
    const catalogNmbsTiledOneLevel = new Catalog();
    catalogNmbsTiledOneLevel.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledOneLevel.addConnectionsSource("http://localhost:3000/nmbs-tiled-onelevel-2h/connections/12/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledOneLevel
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-onelevel-2h/tiles", 12);

    const plannerTiledOnelevel = new CustomPlanner(catalogNmbsTiledOneLevel);

    // Multi level
    const catalogNmbsTiledMultiLevel = new Catalog();
    catalogNmbsTiledMultiLevel.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledMultiLevel.addConnectionsSource("http://localhost:3000/nmbs-tiled-multilevel-2h/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledMultiLevel
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-multilevel-2h/tiles");

    const plannerTiledMultilevel = new CustomPlanner(catalogNmbsTiledMultiLevel);

    // One level tree
    const catalogNmbsTiledOneLevelTree = new Catalog();
    catalogNmbsTiledOneLevelTree.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledOneLevelTree.addConnectionsSource("http://localhost:3000/nmbs-tiled-onelevel-tree-2h/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledOneLevelTree
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-onelevel-tree-2h/connections");

    const plannerTiledOnelevelTree = new CustomPlanner(catalogNmbsTiledOneLevelTree, profile_tree);

    // Multi level tree
    const catalogNmbsTiledMultiLevelTree = new Catalog();
    catalogNmbsTiledMultiLevelTree.addStopsSource("https://irail.be/stations/NMBS");
    catalogNmbsTiledMultiLevelTree.addConnectionsSource("http://localhost:3000/nmbs-tiled-multilevel-tree-2h/connections/{zoom}/{x}/{y}",
        TravelMode.Train);
    catalogNmbsTiledMultiLevelTree
        .addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled-multilevel-tree-2h/connections");

    const plannerTiledMultilevelTree = new CustomPlanner(catalogNmbsTiledMultiLevelTree, profile_tree);

    // Baseline
    const baseLinePlanner = new DelijnNmbsPlanner(); // Delijn removed from catalog

    logResults = false;
    if (logResults) {
        let scannedPages = 0;
        let scannedPagesSize = 0;
        let scannedConnections = 0;

        const eventBus = EventBus.getInstance();

        const logFetch = false; // Log urls

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
            .on(EventType.LDFetchGet, (url: string, duration, size?: number, type?: string) => {
                if (type === "leaf" || type === "connections") {
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

    const queries: IQuery[] = await readQueries("/home/jflipts/Documents/queries-nmbs", 100, new Date(2019, 11, 1, 12));

    const metricsBaseline: IResultMetics[] = [];
    const metricsStraightLineOneLevel: IResultMetics[] = [];
    const metricsStraightLineMultiLevel: IResultMetics[] = [];
    const metricsExpandingOneLevel: IResultMetics[] = [];
    const metricsTreeOneLevel: IResultMetics[] = [];
    const metricsTreeMultiLevel: IResultMetics[] = [];

    const testQueries = [{ // Query that fails on one levels and makes improvement on multilevel
        from: "http://irail.be/stations/NMBS/008814001",
        to: "http://irail.be/stations/NMBS/008881000",
        minimumDepartureTime: new Date(2019, 11, 1, 12, 34, 2),
        maximumTransferDuration: 1800000,
    }];

    for (const [ix, query] of queries.entries()) {
        console.log("Query: " + ix);

        // Base case
        await executeQuery(new DelijnNmbsPlanner(), query)
            .then((queryMetrics) => {
                metricsBaseline.push(queryMetrics);
            });
        await waitForMs(500);

        // // Straight line + One level
        // query.tilesFetchStrategy = "straight-line";
        // await executeQuery(new CustomPlanner(catalogNmbsTiledOneLevel), query)
        //     .then((queryMetrics) => {
        //         metricsStraightLineOneLevel.push(queryMetrics);
        //     });
        // await waitForMs(500);

        // Straight line + Multi level
        query.tilesFetchStrategy = "straight-line";
        await executeQuery(new CustomPlanner(catalogNmbsTiledMultiLevel), query)
            .then((queryMetrics) => {
                metricsStraightLineMultiLevel.push(queryMetrics);
            });
        await waitForMs(500);

        // // Expanding + One level
        // query.tilesFetchStrategy = "expanding";
        // await executeQuery(new CustomPlanner(catalogNmbsTiledOneLevel), query)
        //     .then((queryMetrics) => {
        //         metricsExpandingOneLevel.push(queryMetrics);
        //     });
        // await waitForMs(500);

        // // Tree + One level
        // query.tilesFetchStrategy = "tree";
        // await executeQuery(new CustomPlanner(catalogNmbsTiledOneLevelTree, profile_tree), query)
        //     .then((queryMetrics) => {
        //         metricsTreeOneLevel.push(queryMetrics);
        //     });
        // await waitForMs(500);

        // Tree + Multi level
        query.tilesFetchStrategy = "tree";
        await executeQuery(new CustomPlanner(catalogNmbsTiledMultiLevelTree, profile_tree), query)
            .then((queryMetrics) => {
                metricsTreeMultiLevel.push(queryMetrics);
            });
        await waitForMs(500);

        console.log("\n");
    }

    // wait 15 seconds to make sure everyting settled
    await waitForMs(1000 * 15);

    const statsBaseline = computeStastics(metricsBaseline, "baseline", metricsBaseline);
    // const statsStraightOneLevel
        // += computeStastics(metricsStraightLineOneLevel, "straight-one-level", metricsBaseline);
    const statsStraightMultiLevel
        = computeStastics(metricsStraightLineMultiLevel, "straight-multi-level", metricsBaseline);
    // const statsExpandingOneLevel = computeStastics(metricsExpandingOneLevel, "expanding-one-level", metricsBaseline);
    // const statsTreeOneLevel = computeStastics(metricsTreeOneLevel, "tree-one-level", metricsBaseline);
    const statsTreeMultiLevel = computeStastics(metricsTreeMultiLevel, "tree-multi-level", metricsBaseline);

    const csv = new ObjectsToCSV([
        statsBaseline,
        // statsStraightOneLevel,
        statsStraightMultiLevel,
        // statsExpandingOneLevel,
        // statsTreeOneLevel,
        statsTreeMultiLevel,
    ]);

    await csv.toDisk(
        "/home/jflipts/Documents/planner-output/" + new Date().toISOString() + ".csv",
        { allColumns: true, header: true },
    );

    console.log("Finished succesfully");
};

/**
 * Execute a single query on the specified planner and return a ResultMetrics object
 * @param planner
 * @param query
 */
function executeQuery(planner: Planner, query: IQuery): Promise<IResultMetics> {
    return new Promise((resolve, reject) => {
        let stageNumber = 1;
        let stageStartTime = new Date();
        let stageScannedPages = 0;
        let stageScannedPagesSize = 0;

        const queryMetrics: IResultMetics = {
            query,
            totalDuration: undefined,
            totalSize: 0,
            totalScannedPages: 0,
            totalScannedPagesSize: 0,
            stages: [],
        };

        // Creation of new stage and alterantive ending
        const tiledQueryListener = (resolvedQuery: IResolvedQueryTiled) => {
            const numberOfTiles = resolvedQuery.tilesToFetch.size;
            const duration = (new Date().getTime() - stageStartTime.getTime()) / 1000;
            const stage: IStageMetrics = {
                stage: stageNumber,
                duration,
                scannedTiles: numberOfTiles,
                scannedPages: stageScannedPages,
                scannedPagesSize: stageScannedPagesSize,
            };
            queryMetrics.stages.push(stage);

            if (!queryMetrics.totalScannedTiles) { queryMetrics.totalScannedTiles = 0; }
            queryMetrics.totalScannedTiles += numberOfTiles;

            stageNumber++;
            stageStartTime = new Date();
            stageScannedPages = 0;
            stageScannedPagesSize = 0;
        };

        // Updates to fetchcounters and fetch sizes
        const LDFetchGetListener = (url: string, duration, size?: number, type?: string) => {
            if (type === "leaf" || type === "connections") {
                queryMetrics.totalScannedPages++;
                stageScannedPages++;

                if (size) {
                    stageScannedPagesSize += +size;
                    queryMetrics.totalScannedPagesSize += +size;
                    queryMetrics.totalSize += +size;
                }

            } else if (type === "internal-node") {
                if (!queryMetrics.totalScannedInternalNodes) {
                    queryMetrics.totalScannedInternalNodes = 0;
                    queryMetrics.totalScannedInternalNodesSize = 0;
                }
                queryMetrics.totalScannedInternalNodes++;
                if (size) {
                    queryMetrics.totalScannedInternalNodesSize += size;
                    queryMetrics.totalSize += +size;
                }
            } else if (type === "available-tiles") {
                if (size) {
                    queryMetrics.totalSize += +size;
                }
            }
        };

        // Add listeners, listeners need to be removed afterwards
        EventBus.getInstance()
            .on(EventType.TiledQuery, tiledQueryListener)
            .on(EventType.LDFetchGet, LDFetchGetListener);

        const t0 = new Date().getTime();
        planner
            .setProfileID("https://hdelva.be/profile/pedestrian")
            .query(query)
            .on("data", (journey: IPath) => {
                // Updates to arrival times
                const arrivalTime = journey.getArrivalTime(query);
                const dataTime = (new Date().getTime() - t0) / 1000;
                if (!queryMetrics.firstEarliestArrivalTime) {
                    queryMetrics.firstResultDuration = dataTime;
                    queryMetrics.firstEarliestArrivalTime = arrivalTime;
                    queryMetrics.bestResultDuration = dataTime;
                    queryMetrics.bestEarliestArrivalTime = arrivalTime;
                } else if (arrivalTime < queryMetrics.bestEarliestArrivalTime) {
                    queryMetrics.bestResultDuration = dataTime;
                    queryMetrics.bestEarliestArrivalTime = arrivalTime;
                }

                // console.log(JSON.stringify(journey, null, " "));
            })
            .on("end", () => {
                queryMetrics.totalDuration = (new Date().getTime() - t0) / 1000;

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
/* tslint:disable:no-string-literal */
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

/**
 * Computes a lot of statistics for a set of results
 *
 * @param queryMetrics
 * @param queryType
 * @param baseMetrics: metrics to calculate accuracy on
 */
function computeStastics(
    queryMetrics: IResultMetics[],
    queryType: string,
    baseMetrics: IResultMetics[],
): { [k: string]: any } {
    const statistics: { [k: string]: any } = {
        queryType,
    };

    // Query time
    const queryTimes: number[] = queryMetrics.map((x) => x.totalDuration);
    statistics.duration_total_005 = percentile(queryTimes, 0.05);
    statistics.duration_total_025 = percentile(queryTimes, 0.25);
    statistics.duration_total_050 = percentile(queryTimes, 0.50);
    statistics.duration_total_075 = percentile(queryTimes, 0.75);
    statistics.duration_total_095 = percentile(queryTimes, 0.95);
    statistics.duration_total_mean = mean(queryTimes);
    statistics.duration_total_deviation = deviation(queryTimes);

    // Query time first result
    const queryTimesFR: number[] = queryMetrics
        .filter((i) => i.firstResultDuration !== undefined)
        .map((x) => x.firstResultDuration);
    statistics.duration_firstResult_005 = percentile(queryTimesFR, 0.05);
    statistics.duration_firstResult_025 = percentile(queryTimesFR, 0.25);
    statistics.duration_firstResult_050 = percentile(queryTimesFR, 0.50);
    statistics.duration_firstResult_075 = percentile(queryTimesFR, 0.75);
    statistics.duration_firstResult_095 = percentile(queryTimesFR, 0.95);
    statistics.duration_firstResult_mean = mean(queryTimesFR);
    statistics.duration_firstResult_deviation = deviation(queryTimesFR);

    // Query time best result
    const queryTimesBest: number[] = queryMetrics
        .filter((i) => i.bestResultDuration !== undefined)
        .map((x) => x.bestResultDuration);
    statistics.duration_bestResult_005 = percentile(queryTimesBest, 0.05);
    statistics.duration_bestResult_025 = percentile(queryTimesBest, 0.25);
    statistics.duration_bestResult_050 = percentile(queryTimesBest, 0.50);
    statistics.duration_bestResult_075 = percentile(queryTimesBest, 0.75);
    statistics.duration_bestResult_095 = percentile(queryTimesBest, 0.95);
    statistics.duration_bestResult_mean = mean(queryTimesBest);
    statistics.duration_bestResult_deviation = deviation(queryTimesBest);

    // Accuracy first result
    const firstEarliestArrivalTimes: number[] = queryMetrics.map((x) => {
        if (x.firstEarliestArrivalTime) { return x.firstEarliestArrivalTime.getTime() / 1000; }
        return undefined;
    });
    const firstEarliestArrivalTimesBase: number[] = baseMetrics.map((x) => {
        if (x.firstEarliestArrivalTime) { return x.firstEarliestArrivalTime.getTime() / 1000; }
        return undefined;
    });
    const differenceFirstEarliestArrivalTimes: number[] = firstEarliestArrivalTimes
        .map((val, ix) => val - firstEarliestArrivalTimesBase[ix]);
    statistics.accuracy_firstEA = differenceFirstEarliestArrivalTimes
        .filter((i) => i === 0).length / queryMetrics.length;
    statistics.accuracy_firstEA_10 = differenceFirstEarliestArrivalTimes
        .filter((i) => i <= 1000 * 60 * 10).length / queryMetrics.length;
    // Accuracy first result excluding NaN
    const differenceFirstEarliestArrivalTimesNoNan: number[] = differenceFirstEarliestArrivalTimes
        .filter((i) => !isNaN(i));
    statistics.accuracy_firstEA_NoNan = differenceFirstEarliestArrivalTimesNoNan
        .filter((i) => i === 0).length / differenceFirstEarliestArrivalTimesNoNan.length || 0;
    statistics.accuracy_firstEA_NoNan_10 = differenceFirstEarliestArrivalTimesNoNan
        .filter((i) => i <= 1000 * 60 * 10).length / differenceFirstEarliestArrivalTimesNoNan.length || 0;
    // Mean and deviation always exclude NaN
    statistics.accuracy_firstEA_mean = mean(differenceFirstEarliestArrivalTimesNoNan);
    statistics.accuracy_firstEA_deviation = deviation(differenceFirstEarliestArrivalTimesNoNan);

    // Count NaN
    const differenceFirstEarliestArrivalTimesNan: number[] = firstEarliestArrivalTimes
        .filter((i) => i === undefined);
    statistics.count_noResult = differenceFirstEarliestArrivalTimesNan.length;

    // Accuracy best result
    const bestEarliestArrivalTimes: number[] = queryMetrics.map((x) => {
        if (x.bestEarliestArrivalTime) { return x.bestEarliestArrivalTime.getTime() / 1000; }
        return undefined;
    });
    const bestEarliestArrivalTimesBase: number[] = baseMetrics.map((x) => {
        if (x.bestEarliestArrivalTime) { return x.bestEarliestArrivalTime.getTime() / 1000; }
        return undefined;
    });
    const differenceBestEarliestArrivalTimes: number[] = bestEarliestArrivalTimes
        .map((val, ix) => val - bestEarliestArrivalTimesBase[ix]);
    statistics.accuracy_bestEA = differenceBestEarliestArrivalTimes
        .filter((i) => i === 0).length / queryMetrics.length;
    statistics.accuracy_bestEA_10 = differenceBestEarliestArrivalTimes
        .filter((i) => i <= 1000 * 60 * 10).length / queryMetrics.length;
    // Accuracy best result excluding NaN
    const differenceBestEarliestArrivalTimesNoNan: number[] = differenceBestEarliestArrivalTimes
        .filter((i) => !isNaN(i));
    statistics.accuracy_bestEA_NoNan = differenceBestEarliestArrivalTimesNoNan
        .filter((i) => i === 0).length / differenceBestEarliestArrivalTimesNoNan.length || 0;
    statistics.accuracy_bestEA_NoNan_10 = differenceBestEarliestArrivalTimesNoNan
        .filter((i) => i <= 1000 * 60 * 10).length / differenceBestEarliestArrivalTimesNoNan.length || 0;
    // Mean and deviation always exclude NaN
    statistics.accuracy_bestEA_mean = mean(differenceBestEarliestArrivalTimesNoNan);
    statistics.accuracy_bestEA_deviation = deviation(differenceBestEarliestArrivalTimesNoNan);

    // Total size
    const querySize: number[] = queryMetrics.map((x) => x.totalSize / 1024);
    statistics.size_total_005 = percentile(querySize, 0.05);
    statistics.size_total_025 = percentile(querySize, 0.25);
    statistics.size_total_050 = percentile(querySize, 0.50);
    statistics.size_total_075 = percentile(querySize, 0.75);
    statistics.size_total_095 = percentile(querySize, 0.95);
    statistics.size_total_mean = mean(querySize);
    statistics.size_total_deviation = deviation(querySize);

    // # Scanned pages
    const pagesScanned: number[] = queryMetrics.map((x) => x.totalScannedPages);
    statistics.count_scannedPages_005 = percentile(pagesScanned, 0.05);
    statistics.count_scannedPages_025 = percentile(pagesScanned, 0.25);
    statistics.count_scannedPages_050 = percentile(pagesScanned, 0.50);
    statistics.count_scannedPages_075 = percentile(pagesScanned, 0.75);
    statistics.count_scannedPages_095 = percentile(pagesScanned, 0.95);
    statistics.count_scannedPages_mean = mean(pagesScanned);
    statistics.count_scannedPages_deviation = deviation(pagesScanned);

    // Scanned pages size
    const pagesScannedSize: number[] = queryMetrics.map((x) => x.totalScannedPagesSize / 1024);
    statistics.size_scannedPages_005 = percentile(pagesScannedSize, 0.05);
    statistics.size_scannedPages_025 = percentile(pagesScannedSize, 0.25);
    statistics.size_scannedPages_050 = percentile(pagesScannedSize, 0.50);
    statistics.size_scannedPages_075 = percentile(pagesScannedSize, 0.75);
    statistics.size_scannedPages_095 = percentile(pagesScannedSize, 0.95);
    statistics.size_scannedPages_mean = mean(pagesScannedSize);
    statistics.size_scannedPages_deviation = deviation(pagesScannedSize);

    // # Scanned tiles
    if (queryMetrics[0].totalScannedTiles) {
        const tilesScanned: number[] = queryMetrics.map((x) => x.totalScannedTiles);
        statistics.count_scannedTiles_005 = percentile(tilesScanned, 0.05);
        statistics.count_scannedTiles_025 = percentile(tilesScanned, 0.25);
        statistics.count_scannedTiles_050 = percentile(tilesScanned, 0.50);
        statistics.count_scannedTiles_075 = percentile(tilesScanned, 0.75);
        statistics.count_scannedTiles_095 = percentile(tilesScanned, 0.95);
        statistics.count_scannedTiles_mean = mean(tilesScanned);
        statistics.count_scannedTiles_deviation = deviation(tilesScanned);
    }

    if (queryMetrics[0].totalScannedInternalNodes) {
        // # Scanned internalNodes
        const internalNodesScanned: number[] = queryMetrics.map((x) => x.totalScannedInternalNodes);
        statistics.count_scannedInternalNodes_005 = percentile(internalNodesScanned, 0.05);
        statistics.count_scannedInternalNodes_025 = percentile(internalNodesScanned, 0.25);
        statistics.count_scannedInternalNodes_050 = percentile(internalNodesScanned, 0.50);
        statistics.count_scannedInternalNodes_075 = percentile(internalNodesScanned, 0.75);
        statistics.count_scannedInternalNodes_095 = percentile(internalNodesScanned, 0.95);
        statistics.count_scannedInternalNodes_mean = mean(internalNodesScanned);
        statistics.count_scannedInternalNodes_deviation = deviation(internalNodesScanned);

        // Scanned internalNodes size
        const internalNodesScannedSize: number[] = queryMetrics.map((x) => x.totalScannedInternalNodesSize / 1024);
        statistics.size_scannedInternalNodes_005 = percentile(internalNodesScannedSize, 0.05);
        statistics.size_scannedInternalNodes_025 = percentile(internalNodesScannedSize, 0.25);
        statistics.size_scannedInternalNodes_050 = percentile(internalNodesScannedSize, 0.50);
        statistics.size_scannedInternalNodes_075 = percentile(internalNodesScannedSize, 0.75);
        statistics.size_scannedInternalNodes_095 = percentile(internalNodesScannedSize, 0.95);
        statistics.size_scannedInternalNodes_mean = mean(internalNodesScannedSize);
        statistics.size_scannedInternalNodes_deviation = deviation(internalNodesScannedSize);
    }

    // Stages

    return statistics;
}

/**
 * Calculate percentiles
 * @param arr
 * @param p: Value between 0 and 1
 */
function percentile(arr: number[], p: number) {
    if (arr.length === 0) { return 0; }
    arr.sort((a, b) => a - b);
    if (p <= 0) { return arr[0]; }
    if (p >= 1) { return arr[arr.length - 1]; }

    const index = (arr.length - 1) * p;
    const lower = Math.floor(index);
    const upper = lower + 1;
    const weight = index % 1;

    if (upper >= arr.length) { return arr[lower]; }
    return arr[lower] * (1 - weight) + arr[upper] * weight;
}

function mean(arr: number[]): number {
    if (arr.length === 0) { return undefined; }
    const sum = arr.reduce((a, b) => a + b);
    return sum / arr.length;
}

function deviation(arr: number[]): number {
    if (arr.length === 0) { return undefined; }
    const avg = mean(arr);
    const squareDiffs = arr.map((value) => Math.pow(value - avg, 2));
    return Math.sqrt(mean(squareDiffs));
}

function waitForMs(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
