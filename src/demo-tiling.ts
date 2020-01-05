import { BasicTrainPlanner, CustomPlanner } from ".";
import EventBus from "./events/EventBus";
import EventType from "./events/EventType";
import IPath from "./interfaces/IPath";
import IResolvedQueryTiled from "./planner/public-transport/IResolvedQueryTiled";
import Units from "./util/Units";

export default async (logResults: boolean) => {

    const planner = new CustomPlanner();
    // const planner = new BasicTrainPlanner();

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

    // let queryTemplate = {
    //     from : "",
    //     to : "",
    //     minimumDepartureTime: new Date(),
    //     maximumTransferDuration: Units.fromMinutes(30),
    // };

    const amount = 2;

    planner
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
        .on("data", (path: IPath) => {

            if (logResults) {
                console.log(new Date());
                console.log(JSON.stringify(path, null, " "));
                console.log("\n");
            }
        })
        .on("end", () => {
            console.log(`${new Date()} Finish query`);
        });

};
