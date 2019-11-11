import Catalog from "./Catalog";
import TravelMode from "./enums/TravelMode";

const catalogNmbs = new Catalog();

catalogNmbs.addStopsSource("https://irail.be/stations/NMBS");
catalogNmbs.addConnectionsSource("http://localhost:3000/nmbs-small-tiled/connections/12/{x}/{y}", TravelMode.Train);

export default catalogNmbs;
