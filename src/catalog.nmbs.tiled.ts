import Catalog from "./Catalog";
import TravelMode from "./enums/TravelMode";

const catalogNmbs = new Catalog();

catalogNmbs.addStopsSource("https://irail.be/stations/NMBS");
catalogNmbs.addConnectionsSource("http://localhost:3000/nmbs-tiled/connections/12/{x}/{y}", TravelMode.Train);
catalogNmbs.addAvailablePublicTransportTilesSource("http://localhost:3000/nmbs-tiled/tiles/12");

export default catalogNmbs;
