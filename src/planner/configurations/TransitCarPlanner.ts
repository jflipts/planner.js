import { AsyncIterator } from "asynciterator";
import transitCarProfile from "../../configs/transit_car";
import IPath from "../../interfaces/IPath";
import IQuery from "../../interfaces/IQuery";
import Planner from "./Planner";

export default class TransitCarPlanner extends Planner {
    constructor() {
        super(transitCarProfile);
        this.setProfileID("http://hdelva.be/profile/car");
    }

    public query(query: IQuery): AsyncIterator<IPath> {
        query.roadNetworkOnly = true;
        return super.query(query);
    }
}
